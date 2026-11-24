const assert = require('node:assert/strict');
const { test } = require('node:test');

const { animeAutocomplete, resetAutocomplete } = require('../src/anime/autocomplete');
const cacheModule = require('../src/anime/cache');
const {
    MAX_PER_WINDOW: LIMIT,
    MEDIA_QUERY: MEDIA,
    MIN_INTERVAL_MS: INTERVAL,
    RANDOM_MIN_POPULARITY,
    RANDOM_MIN_SCORE,
    RANDOM_QUERY,
    SEARCH_QUERY: SEARCH,
    SEARCH_TTL_MS: SEARCH_TTL,
    DETAIL_TTL_MS: DETAIL_TTL,
    buildRandomQuery,
    delayMs,
    createClient,
    createLimiter,
    curateTags,
    filterRandomPool,
    fromAnilist,
    genreNamesFrom,
    kitsuDecent,
    kitsuRandomUrl,
    pickRandomPage,
    plainSynopsis,
} = require('../src/anime/client');
const { animeEmbed } = require('../src/anime/embed');

function response(status, body, headers = {}) {
    return {
        status,
        headers: { get: (name) => headers[String(name).toLowerCase()] || null },
        json: async () => body,
    };
}

function anilistMedia(id, extra = {}) {
    return {
        id,
        isAdult: false,
        siteUrl: `https://anilist.co/anime/${id}`,
        description: '<p>A <b>story</b><br>about jazz.</p>~!the ending!~',
        episodes: 26,
        status: 'FINISHED',
        averageScore: 86,
        genres: ['Action', 'Drama'],
        synonyms: ['Bebop'],
        title: { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', native: 'カウボーイビバップ' },
        tags: [
            { name: 'Space', rank: 90, isGeneralSpoiler: false, isMediaSpoiler: false },
            { name: 'Secret ending', rank: 99, isGeneralSpoiler: false, isMediaSpoiler: true },
        ],
        studios: { nodes: [{ name: 'Sunrise', isAnimationStudio: true }] },
        startDate: { year: 1998, month: 4, day: 3 },
        endDate: { year: 1999, month: 4, day: 24 },
        coverImage: { large: `https://cdn.example/cover-${id}.jpg` },
        ...extra,
    };
}

function kitsuItem(id, attributes) {
    return {
        data: [{
            id: String(id),
            type: 'anime',
            attributes,
            relationships: { categories: { data: [] } },
        }],
        included: [],
    };
}

test('queries always exclude adult anime and stay under about 25 requests a minute', () => {
    assert.match(SEARCH, /isAdult:\s*false/);
    assert.match(MEDIA, /isAdult:\s*false/);
    assert.equal(SEARCH.toLowerCase().includes('jikan'), false);
    assert.equal(LIMIT, 24);
    assert.ok(INTERVAL >= 2500);
    assert.equal(DETAIL_TTL, 24 * 60 * 60 * 1000);
    assert.equal(SEARCH_TTL, 15 * 60 * 1000);
    const now = 100000;
    const stamps = Array.from({ length: 24 }, (_, index) => now - 50000 + index);
    assert.ok(delayMs({
        now,
        stamps,
        pauseUntil: 0,
        minIntervalMs: INTERVAL,
        maxPerWindow: LIMIT,
        windowMs: 60000,
    }) > 0);
    assert.equal(delayMs({
        now,
        stamps: [],
        pauseUntil: now + 30000,
        minIntervalMs: 0,
        maxPerWindow: LIMIT,
        windowMs: 60000,
    }), 30000);
});

test('html is stripped, adult rows are dropped, and only the cover URL is kept', () => {
    const adult = fromAnilist(anilistMedia(9, { isAdult: true }));
    const safe = fromAnilist(anilistMedia(1));
    assert.equal(adult, null);
    assert.equal(safe.synopsis.includes('<'), false);
    assert.equal(safe.synopsis.includes('ending'), false);
    assert.match(safe.synopsis, /story/);
    assert.deepEqual(safe.tags, ['Space']);
    assert.equal(safe.cover, 'https://cdn.example/cover-1.jpg');
    assert.equal(Buffer.isBuffer(safe.cover), false);
    assert.equal(plainSynopsis('<i>Hi</i>'), 'Hi');

    const embed = animeEmbed(safe).toJSON();
    assert.equal(embed.image.url, safe.cover);
    assert.match(embed.footer.text, /AniList/);
    assert.match(embed.footer.text, /anilist\.co\/anime\/1/);
    assert.equal(embed.url, 'https://anilist.co/anime/1');
});

test('the detail cache is bounded and expires', () => {
    let now = 0;
    const cache = cacheModule.createCache({ max: 2, ttlMs: 10, now: () => now });
    cache.set('a', { cover: 'https://cdn.example/a.jpg' });
    cache.set('b', 2);
    cache.set('c', 3);
    assert.equal(cache.size, 2);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.get('c'), 3);
    now = 11;
    assert.equal(cache.get('c'), undefined);
});

function memoryCaches(now = () => 0) {
    return {
        detailCache: cacheModule.createCache({ max: 500, ttlMs: DETAIL_TTL, now }),
        searchCache: cacheModule.createCache({ max: 500, ttlMs: SEARCH_TTL, now }),
        genreCache: cacheModule.createCache({ max: 20, ttlMs: DETAIL_TTL, now }),
    };
}

function clientWithCaches(handler, caches, now = () => 0) {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url: String(url), init });
        return handler(String(url), init, calls);
    };
    const limiter = createLimiter({
        now,
        sleep: async () => {},
        minIntervalMs: 0,
        maxPerWindow: 100,
        windowMs: 60000,
    });
    const client = createClient({ fetch: fetchImpl, now, limiter, kitsuLimiter: createLimiter({ minIntervalMs: 0, maxPerWindow: 100 }), ...caches });
    return { client, calls, limiter };
}

function clientWith(handler, now = () => 0) {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url: String(url), init });
        return handler(String(url), init, calls);
    };
    const limiter = createLimiter({
        now,
        sleep: async () => {},
        minIntervalMs: 0,
        maxPerWindow: 100,
        windowMs: 60000,
    });
    const client = createClient({ fetch: fetchImpl, now, limiter, kitsuLimiter: createLimiter({ minIntervalMs: 0, maxPerWindow: 100 }), ...memoryCaches(now) });
    return { client, calls };
}

test('a cache hit does not call fetch', async () => {
    const { client, calls } = clientWith(() => response(200, {
        data: { Page: { media: [anilistMedia(1)] }, Media: anilistMedia(1) },
    }));
    const found = await client.search('cowboy bebop');
    assert.equal(found.length, 1);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /anilist\.co/);
    assert.match(calls[0].init.body, /isAdult:\s*false/);
    const again = await client.search('Cowboy Bebop');
    assert.equal(again.length, 1);
    assert.equal(again[0].cached, true);
    assert.equal(found[0].cached, undefined);
    assert.equal(calls.length, 1);
    const detail = await client.getAnime('1');
    assert.equal(detail.id, '1');
    assert.equal(detail.cached, true);
    assert.equal(calls.length, 1);
    assert.equal(detail.cover, 'https://cdn.example/cover-1.jpg');
    const freshFooter = animeEmbed(found[0]).toJSON().footer.text;
    const cachedFooter = animeEmbed(again[0]).toJSON().footer.text;
    assert.match(freshFooter, /Via AniList/);
    assert.match(freshFooter, /anilist\.co\/anime\/1/);
    assert.equal(freshFooter.includes('local cache'), false);
    assert.match(cachedFooter, /Via AniList • local cache/);
    assert.match(cachedFooter, /anilist\.co\/anime\/1/);
});

test('429 honors Retry-After and falls back to Kitsu without calling AniList again', async () => {
    const { client, calls } = clientWith((url) => {
        if (url.includes('anilist')) return response(429, {}, { 'retry-after': '30' });
        assert.match(decodeURIComponent(url), /filter\[nsfw\]=false/);
        return response(200, kitsuItem('4', {
            canonicalTitle: 'Cowboy Bebop',
            titles: { en: 'Cowboy Bebop', en_jp: 'Cowboy Bebop', ja_jp: '' },
            synopsis: 'Bounty hunters.',
            episodeCount: 26,
            status: 'finished',
            averageRating: '86.2',
            startDate: '1998-04-03',
            nsfw: false,
            ageRating: 'PG',
            posterImage: { large: 'https://cdn.kitsu.example/bebop.jpg' },
            slug: 'cowboy-bebop',
        }));
    });
    const first = await client.search('cowboy bebop');
    assert.equal(first[0].source, 'Kitsu');
    assert.equal(first[0].cover, 'https://cdn.kitsu.example/bebop.jpg');
    assert.equal(Buffer.isBuffer(first[0].cover), false);
    const anilistCalls = () => calls.filter((call) => call.url.includes('anilist')).length;
    assert.equal(anilistCalls(), 1);
    const second = await client.search('trigun');
    assert.equal(second[0].source, 'Kitsu');
    assert.equal(anilistCalls(), 1);
});

test('a 5xx response falls back to Kitsu and adult Kitsu rows are dropped', async () => {
    const { client, calls } = clientWith((url) => {
        if (url.includes('anilist')) return response(500, {});
        return response(200, {
            data: [
                {
                    id: '1',
                    attributes: { canonicalTitle: 'Hidden', titles: { en: 'Hidden' }, nsfw: true, ageRating: 'R18' },
                },
                {
                    id: '2',
                    attributes: {
                        canonicalTitle: 'Visible',
                        titles: { en: 'Visible' },
                        nsfw: false,
                        ageRating: 'PG',
                        synopsis: 'Safe.',
                        posterImage: { large: 'https://cdn.kitsu.example/visible.jpg' },
                        slug: 'visible',
                    },
                },
            ],
        });
    });
    const found = await client.search('visible');
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 'kitsu:2');
    assert.equal(found[0].titles.english, 'Visible');
    assert.ok(calls.some((call) => call.url.includes('kitsu')));
});

test('a limiter wait past the autocomplete budget returns immediately and still fills the cache', async () => {
    let now = 0;
    let release = () => {};
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const fetches = [];
    const limiter = createLimiter({
        now: () => now,
        sleep: async (ms) => {
            await gate;
            now += ms;
        },
        minIntervalMs: 1000,
        maxPerWindow: 100,
        windowMs: 60000,
    });
    await limiter.schedule(() => 'primed');
    const fetchImpl = async (url, init) => {
        fetches.push(String(url));
        const body = JSON.parse(init.body);
        assert.match(body.query, /isAdult:\s*false/);
        return response(200, { data: { Page: { media: [anilistMedia(8)] } } });
    };
    const client = createClient({ fetch: fetchImpl, now: () => now, limiter, ...memoryCaches(() => now) });
    try {
        const started = Date.now();
        const missed = await client.search('cowboy bebop', { maxWaitMs: 200 });
        assert.deepEqual(missed, []);
        assert.ok(Date.now() - started < 500);
        assert.equal(fetches.length, 0);
        release();
        const filled = await client.search('cowboy bebop');
        assert.equal(filled[0].id, '8');
        assert.equal(fetches.length, 1);
        assert.match(fetches[0], /anilist/);
        assert.match(fetches[0], /isAdult|anilist/);
    } finally {
        release();
    }
});

test('the genre catalog drops Hentai and adult, spoiler, and technical tags', async () => {
    assert.deepEqual(genreNamesFrom(['Drama', 'Hentai', 'Action', 'Drama']), ['Action', 'Drama']);
    assert.deepEqual(curateTags([
        { name: 'Isekai', category: 'Theme-Fantasy', isAdult: false },
        { name: 'Time Skip', category: 'Theme-Other', isAdult: false },
        { name: 'Super Power', category: 'Theme-Fantasy', isAdult: false, isGeneralSpoiler: true },
        { name: 'Iyashikei', category: 'Sexual Content', isAdult: true },
        { name: 'Idol', category: 'Technical', isAdult: false },
        { name: 'Magic', category: 'Theme-Fantasy', isAdult: false, isMediaSpoiler: true },
        { name: 'School', category: 'Setting-Scene', isAdult: false },
    ]), ['Isekai', 'School']);

    const { client, calls } = clientWith((url, init) => {
        assert.match(String(url), /anilist/);
        const body = JSON.parse(init.body);
        assert.match(body.query, /GenreCollection/);
        assert.match(body.query, /MediaTagCollection/);
        assert.match(body.query, /isAdult/);
        return response(200, {
            data: {
                GenreCollection: ['Drama', 'Hentai', 'Action'],
                MediaTagCollection: [
                    { name: 'Isekai', category: 'Theme-Fantasy', isAdult: false },
                    { name: 'School', category: 'Setting-Scene', isAdult: false },
                    { name: 'Idol', category: 'Technical', isAdult: false },
                ],
            },
        });
    });
    assert.deepEqual(await client.getGenres(), ['Action', 'Drama']);
    assert.deepEqual(await client.getTags(), ['Isekai', 'School']);
    assert.equal(calls.length, 1);
    await client.getGenres();
    await client.getTags();
    assert.equal(calls.length, 1);
});

test('a random roll uses one filtered AniList page, then the cache', async () => {
    const { client, calls } = clientWith((url, init) => {
        assert.match(String(url), /anilist/);
        const body = JSON.parse(init.body);
        assert.match(body.query, /isAdult:\s*false/);
        assert.match(body.query, /averageScore_greater/);
        assert.match(body.query, /popularity_greater/);
        assert.deepEqual(body.variables.genres, ['Mecha']);
        assert.equal(body.variables.tags, null);
        return response(200, {
            data: {
                Page: {
                    pageInfo: { lastPage: 3 },
                    media: [
                        anilistMedia(11, { averageScore: 88, popularity: 20000 }),
                        anilistMedia(12, { averageScore: 40, popularity: 20000 }),
                        anilistMedia(13, { averageScore: 90, popularity: 20, isAdult: true }),
                    ],
                },
            },
        });
    });
    const first = await client.randomAnime({ genres: ['Mecha'], tags: [], random: () => 0 });
    assert.equal(first.ok, true);
    assert.equal(first.cached, false);
    assert.equal(first.media.id, '11');
    assert.equal(first.media.cached, undefined);
    assert.equal(calls.length, 1);
    const second = await client.randomAnime({ genres: ['Mecha'], tags: [], random: () => 0 });
    assert.equal(second.cached, true);
    assert.equal(second.media.cached, true);
    assert.equal(calls.length, 1);
    const footer = animeEmbed(second.media).toJSON().footer.text;
    assert.match(footer, /Via AniList • local cache/);
    assert.match(footer, /anilist\.co\/anime\/11/);
});

test('AniList being down uses Kitsu, and an empty page does not', async () => {
    const down = clientWith((url) => {
        if (String(url).includes('anilist')) return response(503, {});
        assert.match(decodeURIComponent(String(url)), /filter\[nsfw\]=false/);
        return response(200, kitsuItem('9', {
            canonicalTitle: 'Planetes',
            titles: { en: 'Planetes' },
            synopsis: 'Space debris.',
            episodeCount: 26,
            status: 'finished',
            averageRating: '82',
            userCount: 4000,
            nsfw: false,
            ageRating: 'PG',
            posterImage: { large: 'https://cdn.kitsu.example/planetes.jpg' },
            slug: 'planetes',
        }));
    });
    const fallback = await down.client.randomAnime({ genres: ['Mecha'], random: () => 0 });
    assert.equal(fallback.ok, true);
    assert.equal(fallback.source, 'Kitsu');
    assert.equal(fallback.media.source, 'Kitsu');
    assert.equal(fallback.media.titles.english, 'Planetes');
    assert.equal(animeEmbed(fallback.media).toJSON().footer.text.includes('local cache'), false);

    const empty = clientWith((url) => {
        assert.match(String(url), /anilist/);
        return response(200, { data: { Page: { pageInfo: { lastPage: 0 }, media: [] } } });
    });
    const missed = await empty.client.randomAnime({ random: () => 0 });
    assert.equal(missed.empty, true);
    assert.equal(empty.calls.some((call) => String(call.url).includes('kitsu')), false);
    const again = await empty.client.randomAnime({ random: () => 0 });
    assert.equal(again.empty, true);
    assert.equal(empty.calls.length, 1);
});

test('search returns before cache writes and runs those writes together', async () => {
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    let active = 0;
    let maxActive = 0;
    const blocking = {
        async get() {
            return undefined;
        },
        set() {
            active += 1;
            maxActive = Math.max(maxActive, active);
            return gate.finally(() => {
                active -= 1;
            });
        },
    };
    const { client } = clientWithCaches(() => response(200, {
        data: { Page: { media: [anilistMedia(1), anilistMedia(2)] } },
    }), {
        detailCache: blocking,
        searchCache: blocking,
        genreCache: blocking,
    });
    const found = await client.search('cowboy bebop');
    assert.equal(found.length, 2);
    assert.equal(found[0].id, '1');
    assert.equal(found[0].cached, undefined);
    assert.ok(maxActive >= 3, `writes in flight ${maxActive}`);
    assert.equal(active, maxActive);
    release();
    await gate;
});

test('autocomplete responds before the cache writes finish', async () => {
    resetAutocomplete();
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    let writes = 0;
    const blocking = {
        async get() {
            return undefined;
        },
        set() {
            writes += 1;
            return gate;
        },
    };
    const { client } = clientWithCaches(() => response(200, {
        data: { Page: { media: [anilistMedia(4)] } },
    }), {
        detailCache: blocking,
        searchCache: blocking,
        genreCache: blocking,
    });
    const rows = [];
    await animeAutocomplete({
        id: 'before-write',
        commandName: 'search',
        user: { id: '42' },
        createdTimestamp: 1_000,
        options: { getFocused: () => 'cowboy bebop' },
        respond: async (choices) => {
            rows.push(choices);
        },
    }, {
        now: () => 1_000,
        peek: () => null,
        waitMs: () => 0,
        coalesceMs: 0,
        search: (text, options) => client.search(text, options),
    });
    assert.deepEqual(rows, [[{ name: 'Cowboy Bebop', value: '4' }]]);
    assert.ok(writes >= 2);
    release();
    await gate;
});

test('identical in-flight searches share one AniList call', async () => {
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const { client, calls } = clientWith(async () => {
        await gate;
        return response(200, { data: { Page: { media: [anilistMedia(1)] } } });
    });
    const first = client.search('naruto');
    const second = client.search('Naruto');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    release();
    const [left, right] = await Promise.all([first, second]);
    assert.equal(left[0].id, '1');
    assert.equal(right[0].id, '1');
    assert.equal(calls.length, 1);
});

test('Kitsu results are cached for fallback-capable callers', async () => {
    const { client, calls } = clientWith((url) => {
        if (String(url).includes('anilist')) return response(500, {});
        return response(200, kitsuItem('2', {
            canonicalTitle: 'Visible',
            titles: { en: 'Visible' },
            nsfw: false,
            ageRating: 'PG',
            synopsis: 'Safe.',
            posterImage: { large: 'https://cdn.kitsu.example/visible.jpg' },
            slug: 'visible',
        }));
    });
    const first = await client.search('visible');
    assert.equal(first[0].id, 'kitsu:2');
    assert.equal((await client.searches.get('visible'))[0].id, 'kitsu:2');
    const second = await client.search('visible');
    assert.equal(second[0].cached, true);
    assert.equal(second[0].id, 'kitsu:2');
    const anilistCalls = calls.filter((call) => String(call.url).includes('anilist')).length;
    assert.equal(anilistCalls, 1);
});

test('a valid empty AniList page is cached briefly', async () => {
    const { client, calls } = clientWith(() => response(200, { data: { Page: { media: [] } } }));
    assert.deepEqual(await client.search('zzzz-no-show'), []);
    assert.deepEqual(await client.search('zzzz-no-show'), []);
    assert.equal(calls.length, 1);
});

test('aborting a dispatched search keeps the AniList limiter slot', async () => {
    let now = 0;
    const limiter = createLimiter({
        now: () => now,
        sleep: async () => {},
        minIntervalMs: 2500,
        maxPerWindow: 24,
        windowMs: 60000,
    });
    const controller = new AbortController();
    let fetches = 0;
    const fetchImpl = (url, init) => new Promise((resolve, reject) => {
        fetches += 1;
        const signal = init && init.signal;
        if (signal) {
            if (signal.aborted) {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
                return;
            }
            signal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            }, { once: true });
        }
    });
    const client = createClient({
        fetch: fetchImpl,
        now: () => now,
        limiter,
        ...memoryCaches(() => now),
    });
    const pending = client.search('cowboy bebop', { signal: controller.signal, budgetMs: 2000 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fetches, 1);
    assert.equal(limiter.waitMs(), 2500);
    controller.abort();
    assert.deepEqual(await pending, []);
    assert.equal(limiter.waitMs(), 2500);
    now += 2500;
    const next = await limiter.schedule(() => 'next');
    assert.equal(next, 'next');
});
