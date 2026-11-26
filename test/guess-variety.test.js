const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectFamily, rememberFamily, familyIndex } = require('../src/guess/families');
const { excludeRecent } = require('../src/guess/policy');
const { createClient } = require('../src/anime/client');
const { createCache } = require('../src/anime/cache');
const { startPoolWarmup } = require('../src/guess/select');

function rng(seed = 12345) {
    return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
const row = (id, relatedIds = []) => ({ anilistId: String(id), relatedIds: relatedIds.map(String) });
const entry = (id, relatedIds = []) => ({ animeId: String(id), relatedIds: relatedIds.map(String) });

test('an exhausted exact-title exclusion stays empty, including a single movie', () => {
    assert.deepEqual(excludeRecent(['1'], ['1']), []);
    assert.deepEqual(excludeRecent(['1', '2'], ['2', '1']), []);
    assert.equal(selectFamily([row(1)], [entry(1)], []), null);
});

test('franchises share protection through sequels, transitive relations and evicted history', () => {
    const rows = [row(1, [2]), row(2, [3]), row(3), row(4)];
    assert.equal(familyIndex(rows).groups.size, 2);
    assert.equal(selectFamily(rows, [], [entry(1)], () => 0).row.anilistId, '4');
    assert.equal(selectFamily([row(3), row(4)], [], [entry(1, [2, 3])], () => 0).row.anilistId, '4');
    // Once metadata links two historical entries they count as one franchise.
    assert.deepEqual(rememberFamily([entry(2), entry(4)], entry(1), rows, 20).map((item) => item.animeId), ['1', '4']);
});

test('server history relaxes only its oldest eligible family, never player history', () => {
    const rows = [row(1), row(2), row(3), row(4)];
    const history = [entry(4), entry(3), entry(2), entry(1)];
    assert.equal(selectFamily(rows, history, [], () => 0.99).row.anilistId, '1');
    assert.equal(selectFamily(rows, history, [entry(1)], () => 0.99).row.anilistId, '2');
    assert.equal(selectFamily(rows, history, history, () => 0), null);
});

test('a franchise with eight entries gets the same selection chance as a standalone series', () => {
    const rows = [...Array.from({ length: 8 }, (_, i) => row(i + 1, [1])), row(99)];
    const random = rng();
    let standalone = 0;
    for (let i = 0; i < 20000; i++) {
        if (selectFamily(rows, [], [], random).row.anilistId === '99') standalone++;
    }
    assert.ok(standalone > 9600 && standalone < 10400, `${standalone}/20000 standalone selections`);
});

test('10,000 seeded rounds respect both history windows while covering all 200 franchises', () => {
    const rows = Array.from({ length: 200 }, (_, i) => row(i + 1));
    const random = rng(42);
    let guild = [];
    let player = [];
    const counts = new Map();
    for (let i = 0; i < 10000; i++) {
        const selected = selectFamily(rows, guild, player, random);
        assert.ok(selected);
        const id = selected.row.anilistId;
        assert.ok(!player.some((item) => item.animeId === id));
        assert.ok(!guild.some((item) => item.animeId === id));
        counts.set(id, (counts.get(id) || 0) + 1);
        guild = rememberFamily(guild, selected.entry, rows, 50);
        player = rememberFamily(player, selected.entry, rows, 20);
    }
    assert.equal(counts.size, 200);
    assert.ok(Math.max(...counts.values()) < 85);
    assert.ok(Math.min(...counts.values()) > 20);
});

test('pool warmup starts without a player request, repeats once a minute and stops cleanly', () => {
    const jobs = [];
    let tick, cleared;
    const stop = startPoolWarmup({
        maintenance: { request: (work) => { jobs.push(work); } },
        setTimer: (work, ms) => { tick = work; assert.equal(ms, 60000); return 42; },
        clearTimer: (timer) => { cleared = timer; },
    });
    assert.equal(jobs.length, 1);
    tick(); assert.equal(jobs.length, 2);
    stop(); tick(); assert.equal(jobs.length, 2); assert.equal(cleared, 42);
});

function media(id, extra = {}) {
    return { id, idMal: id, isAdult: false, status: 'FINISHED', averageScore: 80, popularity: 50000,
        title: { english: `Anime ${id}` }, ...extra };
}

test('guess candidates span broader pages, genres and eras using a separate cached query', async () => {
    const requests = [];
    let now = 0;
    const client = createClient({
        now: () => now,
        searchCache: createCache({ max: 100, ttlMs: 60000, now: () => now }),
        detailCache: createCache({ max: 100, ttlMs: 60000 }),
        limiter: { waitMs: () => 0, schedule: (run) => run() },
        fetch: async (_url, options) => {
            requests.push(JSON.parse(options.body));
            return { status: 200, json: async () => ({ data: { Page: { pageInfo: { lastPage: 100 }, media: [
                media(1, { relations: { edges: [
                    { relationType: 'SEQUEL', node: { id: 2, type: 'ANIME', title: { english: 'Sequel' } } },
                    { relationType: 'CHARACTER', node: { id: 3, type: 'ANIME', title: { english: 'Crossover' } } },
                    { relationType: 'ADAPTATION', node: { id: 4, type: 'MANGA', title: { english: 'Manga' } } },
                ] } }),
                media(5, { isAdult: true }), media(6, { idMal: null }),
                media(7, { status: 'NOT_YET_RELEASED' }), media(8, { averageScore: 69 }),
            ] } } }) };
        },
    });
    const first = await client.getGuessCandidates({ random: () => 0.999 });
    assert.equal(first.media.length, 1);
    assert.deepEqual(first.media[0].relatedIds, ['2']);
    assert.deepEqual(first.media[0].relatedTitles, ['Sequel']);
    assert.equal(first.media[0].guessContextVersion, 2);
    await client.getGuessCandidates({ random: () => 0.999 });
    await client.getGuessCandidates({ random: () => 0.999 });
    await client.getGuessCandidates({ random: () => 0.999 });
    assert.equal(requests[0].variables.page, 1);
    assert.deepEqual(requests[1].variables.genres, ['Action']);
    assert.equal(requests[2].variables.before, 20000000);
    assert.equal(requests[3].variables.page, 40);
    assert.match(requests[0].query, /isAdult: false/);
    assert.match(requests[0].query, /\$popAbove: Int = 9999/);
    assert.match(requests[0].query, /popularity_greater: \$popAbove/);
    // Three more scopes return to broad page 40 without a repeated request.
    await client.getGuessCandidates({ random: () => 0.999 });
    await client.getGuessCandidates({ random: () => 0.999 });
    const before = requests.length;
    await client.getGuessCandidates({ random: () => 0.999 });
    assert.equal(requests.length, before);
    now += 20 * 60000; // snapshot + metadata expiry must not force page one
    for (let i = 0; i < 3; i++) await client.getGuessCandidates({ random: () => 0.999 });
    assert.equal(requests.at(-1).variables.page, 40);
});
