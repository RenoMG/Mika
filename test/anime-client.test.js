const assert = require('node:assert/strict');
const { test } = require('node:test');

const cacheModule = require('../src/anime/cache');
const {
    DETAIL_MAX,
    MAX_PER_WINDOW: LIMIT,
    MEDIA_QUERY: MEDIA,
    MIN_INTERVAL_MS: INTERVAL,
    SEARCH_QUERY: SEARCH,
    SEARCH_TTL_MS: SEARCH_TTL,
    DETAIL_TTL_MS: DETAIL_TTL,
    delayMs,
    createClient,
    createLimiter,
    curateTags,
    fromAnilist,
    genreNamesFrom,
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
    assert.equal(DETAIL_MAX, 200);
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
    const client = createClient({ fetch: fetchImpl, now, limiter });
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
    assert.equal(calls.length, 1);
    const detail = await client.getAnime('1');
    assert.equal(detail.id, '1');
    assert.equal(calls.length, 1);
    assert.equal(detail.cover, 'https://cdn.example/cover-1.jpg');
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
    const client = createClient({ fetch: fetchImpl, now: () => now, limiter });
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
