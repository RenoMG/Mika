const assert = require('node:assert/strict');
const { before, after, beforeEach, describe, test } = require('node:test');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const { normalizeTitle } = require('../src/anime/match');
const { animeAutocomplete } = require('../src/anime/autocomplete');
const {
    CACHE_OP_MS,
    DETAIL_TTL_MS,
    SEARCH_TTL_MS,
    createMongoCache,
    storageKey,
} = require('../src/anime/cache');
const { createClient, createLimiter } = require('../src/anime/client');

const USER = '323456789012345678';

function response(status, body) {
    return {
        status,
        headers: { get: () => null },
        json: async () => body,
    };
}

function anilistMedia(id, title) {
    return {
        id,
        idMal: id,
        isAdult: false,
        siteUrl: `https://anilist.co/anime/${id}`,
        description: 'A story.',
        episodes: 12,
        status: 'FINISHED',
        averageScore: 80,
        genres: ['Action'],
        synonyms: [],
        title: { romaji: title, english: title, native: '' },
        tags: [],
        studios: { nodes: [] },
        startDate: { year: 2000, month: 1, day: 1 },
        endDate: { year: 2000, month: 4, day: 1 },
        coverImage: { large: `https://cdn.example/cover-${id}.jpg` },
    };
}

function limiter(now = () => Date.now()) {
    return createLimiter({
        now,
        sleep: async () => {},
        minIntervalMs: 0,
        maxPerWindow: 100,
        windowMs: 60000,
    });
}

function clientWith(handler, caches = {}) {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url: String(url), init });
        return handler(String(url), init, calls);
    };
    const client = createClient({
        fetch: fetchImpl,
        now: () => Date.now(),
        limiter: limiter(),
        ...caches,
    });
    return { client, calls };
}

describe('mongo anime cache', { concurrency: false }, () => {
    let mongoose;
    let mongod;
    let cacheConn;
    let AnimeCache;
    let GuessAnime;
    const cacheDb = require('../src/db/cacheConnection');
    const evict = require('../src/db/evict');

    function bindModels() {
        AnimeCache = require('../src/Models/AnimeCache').get();
        GuessAnime = require('../src/Models/GuessAnime').get();
        if (!AnimeCache || !GuessAnime) throw new Error('cache models are not bound');
        return { AnimeCache, GuessAnime };
    }

    before(async () => {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        mongoose = require('mongoose');
        mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
        const uri = mongod.getUri();
        process.env.MIKADATABASE = uri;
        process.env.MIKADATABASENAME = 'mika';
        process.env.MONGO_CACHE_URI = uri;
        await mongoose.connect(uri, { dbName: 'mika' });
        cacheConn = cacheDb.startCacheConnection();
        await cacheConn.asPromise();
        bindModels();
        await AnimeCache.createIndexes();
        await GuessAnime.createIndexes();
    }, { timeout: 180000 });

    after(async () => {
        evict.resetCacheCaps();
        await cacheDb.closeCacheConnection();
        if (mongoose) await mongoose.disconnect();
        if (mongod) await mongod.stop();
    });

    beforeEach(async () => {
        evict.resetCacheCaps();
        bindModels();
        await AnimeCache.deleteMany({});
        await GuessAnime.deleteMany({});
    });

    async function restoreCache() {
        process.env.MONGO_CACHE_URI = process.env.MIKADATABASE;
        await cacheDb.closeCacheConnection();
        cacheConn = cacheDb.startCacheConnection();
        await cacheConn.asPromise();
        bindModels();
        await AnimeCache.createIndexes();
        await GuessAnime.createIndexes();
    }

    test('a hit, a miss, and expireAt follow the same TTLs', async () => {
        let now = 1_700_000_000_000;
        const details = createMongoCache({ kind: 'detail', ttlMs: DETAIL_TTL_MS, now: () => now });
        const searches = createMongoCache({ kind: 'search', ttlMs: SEARCH_TTL_MS, now: () => now });
        assert.equal(await details.get('4'), undefined);
        await details.set('4', { id: '4', titles: { english: 'Show 4' } });
        assert.equal((await details.get('4')).titles.english, 'Show 4');
        assert.equal(await details.get('5'), undefined);
        const detail = await AnimeCache.findOne({ key: 'detail:4' }).lean();
        assert.equal(new Date(detail.expireAt).getTime(), now + DETAIL_TTL_MS);
        assert.equal(detail.kind, 'detail');

        const logical = normalizeTitle('Cowboy Bebop');
        await searches.set(logical, [{ id: '1' }]);
        const search = await AnimeCache.findOne({ key: storageKey('search', logical) }).lean();
        assert.equal(new Date(search.expireAt).getTime(), now + SEARCH_TTL_MS);
        assert.equal((await searches.get(logical))[0].id, '1');

        now += DETAIL_TTL_MS;
        assert.equal(await details.get('4'), undefined);
        assert.equal(await searches.get(logical), undefined);
        assert.ok(await AnimeCache.findOne({ key: 'detail:4' }));
    });

    test('the TTL index is created and a new module instance reads the same database', async () => {
        const indexes = await AnimeCache.collection.indexes();
        const ttl = indexes.find((index) => index.key && index.key.expireAt === 1);
        const byKey = indexes.find((index) => index.key && index.key.key === 1 && index.unique);
        assert.ok(ttl);
        assert.equal(ttl.expireAfterSeconds, 0);
        assert.ok(byKey);

        const first = createMongoCache({ kind: 'detail', ttlMs: DETAIL_TTL_MS });
        await first.set('8', { id: '8', titles: { english: 'Restart' } });
        const cachePath = require.resolve('../src/anime/cache');
        delete require.cache[cachePath];
        const reloaded = require(cachePath);
        const second = reloaded.createMongoCache({ kind: 'detail', ttlMs: DETAIL_TTL_MS });
        assert.equal((await second.get('8')).titles.english, 'Restart');
        assert.equal(await AnimeCache.countDocuments({ key: 'detail:8' }), 1);
    });

    test('search keys are hashed and a thrown or slow cache still serves a live result', async () => {
        const nasty = '{$gt:""}.*\n';
        const key = storageKey('search', nasty);
        assert.match(key, /^search:[a-f0-9]{64}$/);
        assert.equal(key.includes('$'), false);
        assert.equal(key.includes('*'), false);
        assert.equal(key.includes(nasty), false);
        const searches = createMongoCache({ kind: 'search', ttlMs: SEARCH_TTL_MS });
        await searches.set(nasty, [{ id: '1' }]);
        const docs = await AnimeCache.find({ kind: 'search' }).lean();
        assert.equal(docs.length, 1);
        assert.equal(docs[0].key, key);
        assert.equal(JSON.stringify(docs[0].key).includes('$gt'), false);
        assert.equal((await searches.get(nasty))[0].id, '1');
        assert.equal(await searches.get('{$gt:""}'), undefined);

        const normalized = normalizeTitle('Cowboy Bebop!!');
        assert.equal(normalized, normalizeTitle('  cowboy-bebop '));
        const { client, calls } = clientWith((url) => {
            assert.match(String(url), /anilist/);
            return response(200, { data: { Page: { media: [anilistMedia(1, 'Cowboy Bebop')] } } });
        });
        const found = await client.search('Cowboy Bebop!!');
        assert.equal(found[0].cached, undefined);
        const searchKey = storageKey('search', normalized);
        let landed = null;
        for (let attempt = 0; attempt < 40 && !landed; attempt += 1) {
            landed = await AnimeCache.findOne({ key: searchKey }).lean();
            if (!landed) await new Promise((resolve) => setTimeout(resolve, 15));
        }
        assert.ok(landed);
        const again = await client.search('  cowboy-bebop ');
        assert.equal(again[0].cached, true);
        assert.equal(calls.length, 1);
        const stored = await AnimeCache.findOne({ key: storageKey('search', normalized) }).lean();
        assert.ok(stored);
        assert.deepEqual(stored.value.map((media) => media.id), ['1']);
        assert.equal(JSON.stringify(stored.key).includes('cowboy'), false);
        const detailDoc = await AnimeCache.findOne({ key: 'detail:1' }).lean();
        assert.equal(detailDoc.value.titles.english, 'Cowboy Bebop');
        assert.equal(detailDoc.value.cover, 'https://cdn.example/cover-1.jpg');
        assert.equal(Buffer.isBuffer(detailDoc.value.cover), false);
        assert.equal(JSON.stringify(detailDoc.value).includes('isAdult'), false);

        const broken = {
            async get() {
                throw new Error('mongo down');
            },
            async set() {
                throw new Error('mongo down');
            },
        };
        const failed = clientWith(() => response(200, {
            data: { Page: { media: [anilistMedia(2, 'Trigun')] }, Media: anilistMedia(2, 'Trigun') },
        }), {
            detailCache: broken,
            searchCache: broken,
            genreCache: broken,
        });
        const live = await failed.client.search('trigun');
        assert.equal(live[0].titles.english, 'Trigun');
        const detail = await failed.client.getAnime('2');
        assert.equal(detail.id, '2');
        assert.equal(failed.calls.length, 2);

        const hanging = {
            findOne() {
                const query = {
                    maxTimeMS() {
                        return query;
                    },
                    lean() {
                        return new Promise(() => {});
                    },
                };
                return query;
            },
            updateOne() {
                const query = {
                    maxTimeMS() {
                        return query;
                    },
                    then() {
                        return new Promise(() => {});
                    },
                };
                return query;
            },
        };
        const slowCache = createMongoCache({
            kind: 'search',
            ttlMs: SEARCH_TTL_MS,
            model: hanging,
        });
        const started = Date.now();
        assert.equal(await slowCache.get('cowboy bebop'), undefined);
        await slowCache.set('cowboy bebop', [{ id: '1' }]);
        const elapsed = Date.now() - started;
        assert.ok(elapsed < 1500, `slow cache took ${elapsed}ms`);
        assert.ok(elapsed >= CACHE_OP_MS - 20, `slow cache returned in ${elapsed}ms`);
    });

    test('autocomplete stays inside the budget when the cache hangs or throws', async () => {
        const hanging = {
            async get() {
                return new Promise(() => {});
            },
            async set() {
                return new Promise(() => {});
            },
        };
        const { client, calls } = clientWith(() => response(200, {
            data: { Page: { media: [anilistMedia(1, 'Cowboy Bebop')] } },
        }), {
            detailCache: hanging,
            searchCache: hanging,
            genreCache: hanging,
        });
        const responded = [];
        const interaction = {
            id: '9001',
            commandName: 'search',
            createdTimestamp: Date.now(),
            user: { id: USER },
            responded: false,
            options: { getFocused: () => 'cowboy bebop' },
            async respond(choices) {
                responded.push(choices);
            },
        };
        const started = Date.now();
        await animeAutocomplete(interaction, {
            search: (text, options) => client.search(text, options),
            peek: (text) => client.peekSearch(text),
            waitMs: () => 0,
            now: Date.now,
        });
        const elapsed = Date.now() - started;
        assert.ok(elapsed < 2500, `autocomplete took ${elapsed}ms`);
        assert.equal(responded.length, 1);
        assert.equal(responded[0][0].name, 'Cowboy Bebop');
        assert.equal(calls.length, 1);

        const broken = {
            async get() {
                throw new Error('mongo down');
            },
            async set() {
                throw new Error('mongo down');
            },
        };
        const failed = clientWith(() => response(200, {
            data: { Page: { media: [anilistMedia(3, 'Planetes')] } },
        }), {
            detailCache: broken,
            searchCache: broken,
            genreCache: broken,
        });
        const second = [];
        const again = {
            id: '9002',
            commandName: 'search',
            createdTimestamp: Date.now(),
            user: { id: USER },
            responded: false,
            options: { getFocused: () => 'planetes' },
            async respond(choices) {
                second.push(choices);
            },
        };
        const failedStart = Date.now();
        await animeAutocomplete(again, {
            search: (text, options) => failed.client.search(text, options),
            peek: (text) => failed.client.peekSearch(text),
            waitMs: () => 0,
            now: Date.now,
        });
        assert.ok(Date.now() - failedStart < 2500);
        assert.equal(second[0][0].name, 'Planetes');
        assert.equal(failed.calls.length, 1);
    });

    test('guess entries reuse cached AniList details and a stale copy still refetches', async () => {
        const store = require('../src/guess/store');
        const media = {
            id: '9',
            idMal: 9,
            source: 'AniList',
            url: 'https://anilist.co/anime/9',
            titles: { romaji: 'Show 9', english: 'Show 9', native: '' },
            synonyms: ['Alias 9'],
            synopsis: 'Synopsis',
        };
        await store.saveAnime(media, ['https://shikimori.io/system/screenshots/original/9.jpg'], Date.now());
        const { client, calls } = clientWith(() => {
            throw new Error('a fresh guess copy should satisfy getAnime');
        });
        const hit = await client.getAnime('9');
        assert.equal(hit.cached, true);
        assert.equal(hit.titles.english, 'Show 9');
        assert.equal(calls.length, 0);
        assert.ok(await AnimeCache.findOne({ key: 'detail:9' }));

        await AnimeCache.deleteMany({});
        await GuessAnime.deleteMany({});
        await GuessAnime.create({
            anilistId: '11',
            idMal: 11,
            titles: { romaji: 'Show 11', english: 'Show 11', native: '' },
            synonyms: [],
            media: {
                id: '11',
                idMal: 11,
                source: 'AniList',
                titles: { romaji: 'Show 11', english: 'Show 11', native: '' },
                synonyms: [],
            },
            screenshots: ['https://shikimori.io/system/screenshots/original/11.jpg'],
            fetchedAt: new Date(),
        });
        const shared = await client.getAnime('11');
        assert.equal(shared.cached, true);
        assert.equal(shared.titles.english, 'Show 11');
        assert.equal(calls.length, 0);

        await GuessAnime.deleteMany({});
        await GuessAnime.create({
            anilistId: '12',
            idMal: 12,
            titles: { romaji: 'Old', english: 'Old', native: '' },
            synonyms: [],
            media: {
                id: '12',
                titles: { romaji: 'Old', english: 'Old', native: '' },
                synonyms: [],
            },
            screenshots: ['https://shikimori.io/system/screenshots/original/12.jpg'],
            fetchedAt: new Date(Date.now() - DETAIL_TTL_MS - 60_000),
        });
        const refreshing = clientWith(() => response(200, { data: { Media: anilistMedia(12, 'Fresh') } }));
        const missed = await refreshing.client.getAnime('12');
        assert.equal(missed.titles.english, 'Fresh');
        assert.equal(missed.cached, undefined);
        assert.equal(refreshing.calls.length, 1);
        const forced = await refreshing.client.getAnime('12', { fresh: true });
        assert.equal(forced.titles.english, 'Fresh');
        assert.equal(forced.cached, undefined);
        assert.equal(refreshing.calls.length, 2);
    });

    test('cache models bind to the cache connection and guess progress stays on main', async () => {
        const GuessGuild = require('../src/Models/GuessGuild');
        const GuessPlayer = require('../src/Models/GuessPlayer');
        assert.equal(AnimeCache.db, cacheConn);
        assert.equal(GuessAnime.db, cacheConn);
        assert.equal(GuessGuild.db, mongoose.connection);
        assert.equal(GuessPlayer.db, mongoose.connection);
        assert.notEqual(cacheConn, mongoose.connection);
        assert.equal(AnimeCache.collection.collectionName, 'animecaches');
        assert.equal(GuessAnime.collection.collectionName, 'guessanimes');
        assert.equal(cacheConn.db.databaseName, 'mika-cache');
        assert.equal(mongoose.connection.db.databaseName, 'mika');

        await AnimeCache.create({
            key: 'detail:42',
            kind: 'detail',
            value: { id: '42', titles: { english: 'Bound' } },
            expireAt: new Date(Date.now() + 60_000),
            lastAccessedAt: new Date(),
        });
        await GuessAnime.create({
            anilistId: '42',
            idMal: 42,
            media: { id: '42' },
            screenshots: ['https://shikimori.io/system/screenshots/original/42.jpg'],
            fetchedAt: new Date(),
        });
        assert.equal(await mongoose.connection.db.collection('animecaches').countDocuments(), 0);
        assert.equal(await mongoose.connection.db.collection('guessanimes').countDocuments(), 0);
        assert.equal(await cacheConn.db.collection('animecaches').countDocuments({ key: 'detail:42' }), 1);
        assert.equal(await cacheConn.db.collection('guessanimes').countDocuments({ anilistId: '42' }), 1);

        await GuessGuild.findOneAndUpdate(
            { guildID: 'guild-main' },
            { $set: { recentIds: ['42'] } },
            { upsert: true },
        );
        const guild = await GuessGuild.findOne({ guildID: 'guild-main' }).lean();
        assert.deepEqual(guild.recentIds, ['42']);
        assert.equal(GuessGuild.db, mongoose.connection);
    });

    test('the planned caps stay inside the 440MB budget', () => {
        const estimated = evict.budgetBytes();
        assert.equal(evict.BUDGET_BYTES, 440 * 1024 * 1024);
        assert.ok(estimated < evict.BUDGET_BYTES);
        assert.equal(evict.DEFAULT_CAPS.detail, 100_000);
        assert.equal(evict.DEFAULT_CAPS.search, 2_000);
        assert.equal(evict.DEFAULT_CAPS.genre, 8);
        assert.equal(evict.DEFAULT_CAPS.guessAnime, 12_000);
        assert.equal(evict.ESTIMATED_BYTES.detail, 2048);
        assert.equal(evict.ESTIMATED_BYTES.search, 64 * 1024);
        assert.equal(evict.ESTIMATED_BYTES.guessAnime, 4096);
        assert.equal(evict.collectionCap('animecaches'), 102_008);
        assert.equal(evict.collectionCap('guessanimes'), 12_000);
    });

    test('a document past expireAt is a miss while it is still stored', async () => {
        const past = new Date(Date.now() - 60_000);
        await AnimeCache.create({
            key: 'detail:77',
            kind: 'detail',
            value: { id: '77', titles: { english: 'Stale' } },
            expireAt: past,
            lastAccessedAt: past,
        });
        const details = createMongoCache({ kind: 'detail', ttlMs: DETAIL_TTL_MS });
        assert.equal(await details.get('77'), undefined);
        const still = await AnimeCache.findOne({ key: 'detail:77' }).lean();
        assert.ok(still);
        assert.ok(new Date(still.expireAt).getTime() < Date.now());
    });

    test('eviction keeps each cache collection at or under its cap', async () => {
        evict.setCacheCaps({ detail: 3, search: 2, guessAnime: 2 });
        evict.setTrimEvery(1);
        let now = 1_700_000_000_000;
        const details = createMongoCache({ kind: 'detail', ttlMs: DETAIL_TTL_MS, now: () => now });
        const searches = createMongoCache({ kind: 'search', ttlMs: SEARCH_TTL_MS, now: () => now });
        for (const id of ['1', '2', '3', '4', '5']) {
            now += 1000;
            await details.set(id, { id, titles: { english: `Show ${id}` } });
        }
        for (const text of ['alpha', 'beta', 'gamma', 'delta']) {
            now += 1000;
            await searches.set(text, [text]);
        }
        await evict.settleEviction();
        const detailDocs = await AnimeCache.find({ kind: 'detail' }).lean();
        const searchDocs = await AnimeCache.find({ kind: 'search' }).lean();
        assert.ok(detailDocs.length <= 3);
        assert.equal(detailDocs.length, 3);
        assert.ok(searchDocs.length <= 2);
        assert.equal(searchDocs.length, 2);
        const detailKeys = detailDocs.map((doc) => doc.key).sort();
        assert.deepEqual(detailKeys, ['detail:3', 'detail:4', 'detail:5']);
        assert.ok(await AnimeCache.countDocuments({}) <= evict.collectionCap('animecaches'));

        evict.setTrimEvery(25);
        const store = require('../src/guess/store');
        for (let id = 1; id <= 4; id += 1) {
            await store.saveAnime({
                id: String(id),
                idMal: id,
                source: 'AniList',
                url: `https://anilist.co/anime/${id}`,
                titles: { romaji: `Show ${id}`, english: `Show ${id}`, native: '' },
                synonyms: [],
            }, [`https://shikimori.io/system/screenshots/original/${id}.jpg`], 1_800_000_000_000 + id);
        }
        assert.equal(await GuessAnime.countDocuments(), 4);
        await evict.evictNow();
        const kept = await GuessAnime.find().sort({ anilistId: 1 }).lean();
        assert.ok(kept.length <= 2);
        assert.equal(kept.length, 2);
        assert.deepEqual(kept.map((doc) => doc.anilistId), ['3', '4']);
        assert.ok(await GuessAnime.countDocuments() <= evict.collectionCap('guessanimes'));
    });

    test('search stores result snapshots and survives an evicted detail', async () => {
        const { client, calls } = clientWith((url) => {
            assert.match(String(url), /anilist/);
            return response(200, {
                data: {
                    Page: { media: [anilistMedia(21, 'Planetes'), anilistMedia(22, 'Other')] },
                },
            });
        });
        const found = await client.search('planetes');
        assert.equal(found.length, 2);
        assert.equal(found[0].cached, undefined);
        assert.equal(calls.length, 1);
        const logical = normalizeTitle('planetes');
        const searchKey = storageKey('search', logical);
        let searchDoc = null;
        for (let attempt = 0; attempt < 40 && !searchDoc; attempt += 1) {
            searchDoc = await AnimeCache.findOne({ key: searchKey }).lean();
            if (!searchDoc) await new Promise((resolve) => setTimeout(resolve, 15));
        }
        assert.deepEqual(searchDoc.value.map((media) => media.id), ['21', '22']);
        let first = null;
        let second = null;
        for (let attempt = 0; attempt < 40 && (!first || !second); attempt += 1) {
            first = await AnimeCache.findOne({ key: 'detail:21' }).lean();
            second = await AnimeCache.findOne({ key: 'detail:22' }).lean();
            if (!first || !second) await new Promise((resolve) => setTimeout(resolve, 15));
        }
        assert.equal(first.value.titles.english, 'Planetes');
        assert.equal(second.value.titles.english, 'Other');
        assert.equal(first.value.synopsis, 'A story.');
        assert.match(first.value.cover, /^https:\/\//);

        const again = await client.search('Planetes');
        assert.equal(again[0].cached, true);
        assert.equal(again[1].titles.english, 'Other');
        assert.equal(calls.length, 1);

        await AnimeCache.deleteOne({ key: 'detail:22' });
        const missed = await client.search('planetes');
        assert.equal(missed[0].cached, true);
        assert.equal(calls.length, 1);
        assert.equal(missed[1].titles.english, 'Other');
    });

    test('an unset cache URI retains a bounded local cache', async () => {
        const logs = [];
        const original = console.log;
        console.log = (...args) => {
            logs.push(args.map((part) => String(part)).join(' '));
        };
        try {
            await cacheDb.closeCacheConnection();
            delete process.env.MONGO_CACHE_URI;
            assert.equal(cacheDb.startCacheConnection(), null);
            assert.match(logs.join('\n'), /cache database is not configured/i);
            assert.equal(logs.join('\n').includes('mongodb://'), false);
            const { client, calls } = clientWith(() => response(200, {
                data: { Page: { media: [anilistMedia(30, 'Live')] }, Media: anilistMedia(30, 'Live') },
            }));
            const found = await client.search('live show');
            assert.equal(found[0].titles.english, 'Live');
            const detail = await client.getAnime('30');
            assert.equal(detail.titles.english, 'Live');
            assert.equal(calls.length, 1);
            assert.equal(mongoose.connection.readyState, 1);
            const GuessGuild = require('../src/Models/GuessGuild');
            await GuessGuild.findOneAndUpdate(
                { guildID: 'still-main' },
                { $set: { recentIds: ['30'] } },
                { upsert: true },
            );
            assert.deepEqual((await GuessGuild.findOne({ guildID: 'still-main' }).lean()).recentIds, ['30']);
        } finally {
            console.log = original;
            await restoreCache();
        }
    });

    test('a down cache falls back to live, fails fast, and leaves the main connection up', async () => {
        const errors = [];
        const original = console.error;
        console.error = (...args) => {
            errors.push(args.map((part) => String(part)).join(' '));
        };
        try {
            await cacheDb.closeCacheConnection();
            process.env.MONGO_CACHE_URI = 'mongodb://cache-user:s3cret-password@127.0.0.1:1/mika-cache?serverSelectionTimeoutMS=500';
            const down = cacheDb.startCacheConnection();
            assert.ok(down);
            assert.notEqual(down, mongoose.connection);
            const details = createMongoCache({ kind: 'detail', ttlMs: DETAIL_TTL_MS });
            const started = Date.now();
            assert.equal(await details.get('1'), undefined);
            await details.set('1', { id: '1', titles: { english: 'Nope' } });
            const elapsed = Date.now() - started;
            assert.ok(elapsed < 1000, `down cache took ${elapsed}ms`);
            const { client, calls } = clientWith(() => response(200, {
                data: { Page: { media: [anilistMedia(31, 'Still Live')] }, Media: anilistMedia(31, 'Still Live') },
            }));
            const found = await client.search('still live');
            assert.equal(found[0].titles.english, 'Still Live');
            assert.equal(calls.length, 1);
            assert.equal(mongoose.connection.readyState, 1);
            const GuessPlayer = require('../src/Models/GuessPlayer');
            await GuessPlayer.updateOne(
                { userID: '323456789012345678', guildID: 'guild-main-2' },
                { $set: { wins: 3, crystals: 150 } },
                { upsert: true },
            );
            const player = await GuessPlayer.findOne({ userID: '323456789012345678', guildID: 'guild-main-2' }).lean();
            assert.equal(player.wins, 3);
            assert.equal(player.crystals, 150);
            assert.equal(GuessPlayer.db, mongoose.connection);
            const logged = errors.join('\n');
            assert.equal(logged.includes('s3cret-password'), false);
            assert.equal(logged.includes('cache-user'), false);
            assert.equal(/mongodb(?:\+srv)?:\/\//i.test(logged), false);
        } finally {
            console.error = original;
            await restoreCache();
        }
    });
});
