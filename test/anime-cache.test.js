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
    let AnimeCache;
    let GuessAnime;

    before(async () => {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        mongoose = require('mongoose');
        mongod = await MongoMemoryServer.create();
        process.env.MIKADATABASE = mongod.getUri();
        process.env.MIKADATABASENAME = 'mika';
        await mongoose.connect(process.env.MIKADATABASE, { dbName: 'mika' });
        AnimeCache = require('../src/Models/AnimeCache');
        GuessAnime = require('../src/Models/GuessAnime');
        await AnimeCache.createIndexes();
    }, { timeout: 180000 });

    after(async () => {
        if (mongoose) await mongoose.disconnect();
        if (mongod) await mongod.stop();
    });

    beforeEach(async () => {
        await AnimeCache.deleteMany({});
        await GuessAnime.deleteMany({});
    });

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
        const again = await client.search('  cowboy-bebop ');
        assert.equal(again[0].cached, true);
        assert.equal(calls.length, 1);
        const stored = await AnimeCache.findOne({ key: storageKey('search', normalized) }).lean();
        assert.ok(stored);
        assert.equal(JSON.stringify(stored.key).includes('cowboy'), false);

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
});
