const assert = require('node:assert/strict');
const { test, describe, before, after, beforeEach } = require('node:test');
const { tierOf, tierChoices, poolFilter, EASY_MIN, HARD_MAX } = require('../src/guess/difficulty');
const { crystalReward, winTotal } = require('../src/guess/rewards');
const { packOf } = require('../src/guess/packs');
const { replayRow } = require('../src/guess/replay');
const { promptPayload, startRound } = require('../src/guess/round');
const { createLocks } = require('../src/guess/lock');
const { createClient } = require('../src/anime/client');
const { createCache } = require('../src/anime/cache');
const { GUESS_DAILY_CRYSTALS } = require('../src/guess/constants');

const USER = '323456789012345678';
const GUILD = '123456789012345678';
const CHANNEL = '423456789012345678';
const DAY = 24 * 60 * 60 * 1000;

test('tiers split the pool by popularity, and unknown popularity is Normal only', () => {
    const easy = tierOf('easy');
    const hard = tierOf('hard');
    assert.equal(tierOf('normal'), null);
    assert.equal(tierOf('nope'), null);
    assert.equal(tierOf(undefined), null);
    assert.equal(easy.test({ popularity: EASY_MIN }), true);
    assert.equal(easy.test({ popularity: EASY_MIN - 1 }), false);
    assert.equal(hard.test({ popularity: HARD_MAX - 1 }), true);
    assert.equal(hard.test({ popularity: HARD_MAX }), false);
    assert.equal(easy.test({ popularity: null }), false);
    assert.equal(hard.test({}), false);
    assert.deepEqual(tierChoices().map((choice) => choice.value), ['easy', 'normal', 'hard']);
    assert.ok(tierChoices().every((choice) => choice.name.length <= 100));
});

test('a pack and a tier combine into one filter with its own growth scope', () => {
    const mecha = packOf('mecha');
    const hard = tierOf('hard');
    assert.equal(poolFilter(null, null), null);
    const both = poolFilter(mecha, hard);
    assert.equal(both.id, 'mecha+d-hard');
    assert.deepEqual(both.scope, { genre: 'Mecha', popBelow: HARD_MAX });
    assert.equal(both.test({ genres: ['Mecha'], popularity: 20000 }), true);
    assert.equal(both.test({ genres: ['Mecha'], popularity: 300000 }), false);
    assert.equal(both.test({ genres: ['Comedy'], popularity: 20000 }), false);
    assert.equal(poolFilter(null, hard).id, 'd-hard');
    assert.equal(poolFilter(mecha, null).id, 'mecha');
});

test('the tier sets the base reward, and weekends, boosts and hints apply on top', () => {
    const easy = tierOf('easy');
    const hard = tierOf('hard');
    assert.equal(crystalReward({}), 50);
    assert.equal(crystalReward({ difficulty: easy }), 30);
    assert.equal(crystalReward({ difficulty: hard }), 80);
    assert.equal(crystalReward({ difficulty: hard, crystalMultiplier: 2 }), 160);
    assert.equal(crystalReward({ difficulty: hard, purchasedHints: new Set(['genre']) }), 60);
    // Wager profit does not change with the tier.
    assert.equal(winTotal({ difficulty: hard, wager: 100 }), 280);
    const prompt = promptPayload('https://shikimori.io/a.jpg', { manual: true, difficulty: hard }).embeds[0].data.description;
    assert.match(prompt, /\*\*80\*\* 💎/);
    assert.match(prompt, /🔥 Hard/);
});

test('Play again keeps the difficulty, with or without a pack', () => {
    const id = (round) => replayRow(round, 1_700_000_000_000).toJSON().components[0].custom_id;
    const pattern = /^guess:replay:(0|\d{17,20}):(\d{13})(?::(c|p-[a-z0-9-]{1,30}))?(?::d-(easy|hard))?$/;
    const hardMecha = id({ manual: true, userId: USER, pack: { id: 'mecha' }, difficulty: tierOf('hard') });
    assert.match(hardMecha, /:p-mecha:d-hard$/);
    assert.equal(pattern.exec(hardMecha)[4], 'hard');
    assert.match(id({ manual: true, userId: USER, difficulty: tierOf('easy') }), /:\d{13}:d-easy$/);
    assert.match(id({ manual: true, userId: USER, kind: 'character', difficulty: tierOf('hard') }), /:c$/);
    assert.ok(hardMecha.length <= 100);
});

test('a personal anime round passes the tier to selection; character and auto rounds ignore it', async () => {
    const asked = [];
    const base = {
        channelId: CHANNEL, guildId: GUILD, userId: USER, manual: true, locks: createLocks(),
        peekAndConsume: async () => ({ allowed: true, stamp: 7, remaining: 5 }),
        refund: async () => {}, claimBoost: async () => false,
        choose: async (_guild, options) => { asked.push(options.difficulty?.id || null); return { ok: true, url: 'https://shikimori.io/a.jpg', media: { id: '1' } }; },
        chooseCharacter: async () => ({ ok: true, url: 'https://s4.anilist.co/a.jpg', character: { name: 'Spike' } }),
        send: async () => ({ id: '1' }),
    };
    const hard = tierOf('hard');
    const round = await startRound({ ...base, difficulty: hard, now: Date.parse('2026-11-24T12:00:00-08:00') });
    assert.equal(round.difficulty.id, 'hard');
    await startRound({ ...base, locks: createLocks(), kind: 'character', difficulty: hard });
    await startRound({ ...base, locks: createLocks(), manual: false, difficulty: hard });
    assert.deepEqual(asked, ['hard', null]);
});

test('/guess play turns down a difficulty on a character round', async () => {
    const command = require('../src/commands/guess/guess');
    let reply = null;
    const interaction = {
        channel: { id: CHANNEL }, guild: { id: GUILD }, user: { id: USER }, deferred: true,
        options: { getString: (name) => ({ mode: 'character', difficulty: 'hard' })[name] || null, getInteger: () => null },
        editReply: async (body) => { reply = body; return body; },
    };
    await command.play(interaction, {}, { startRound: () => assert.fail('no round should start') });
    assert.match(reply.content, /Difficulty is for anime rounds/);
    const play = command.data.toJSON().options.find((option) => option.name === 'play');
    assert.ok(play.options.some((option) => option.name === 'difficulty'));
});

test('tier growth narrows AniList candidates, and an empty page shrinks the page range', async () => {
    const requests = [];
    const client = createClient({
        searchCache: createCache({ max: 100, ttlMs: 60000 }),
        detailCache: createCache({ max: 100, ttlMs: 60000 }),
        limiter: { waitMs: () => 0, schedule: (run) => run() },
        fetch: async (_url, options) => {
            const body = JSON.parse(options.body);
            requests.push(body);
            // AniList reports 40 pages, but only page 1 has entries.
            const items = body.variables.page === 1 ? [{ id: 9, idMal: 9, isAdult: false, status: 'FINISHED',
                averageScore: 80, popularity: 250000, title: { english: 'Hit' } }] : [];
            return { status: 200, json: async () => ({ data: { Page: { pageInfo: { lastPage: 40 }, media: items } } }) };
        },
    });
    const scope = { popAbove: EASY_MIN - 1 };
    const first = await client.getGuessCandidates({ scope, random: () => 0 });
    assert.equal(first.media[0].popularity, 250000);
    assert.equal(requests[0].variables.popAbove, EASY_MIN - 1);
    assert.equal('popBelow' in requests[0].variables, false);
    await client.getGuessCandidates({ scope, random: () => 0.999 });
    assert.equal(requests[1].variables.page, 40);
    // The empty page 40 marked page 39 as the end; later pageInfo cannot raise it again.
    await client.getGuessCandidates({ scope, random: () => 0.999 });
    assert.equal(requests[2].variables.page, 39);
    await client.getGuessCandidates({ scope: { popBelow: HARD_MAX }, random: () => 0 });
    assert.equal(requests[3].variables.popBelow, HARD_MAX);
    assert.equal('popAbove' in requests[3].variables, false);
});

describe('guess daily storage', { concurrency: false }, () => {
    let mongoose; let mongod; let store; let GuessPlayer;
    before(async () => {
        mongoose = require('mongoose');
        const { MongoMemoryServer } = require('mongodb-memory-server');
        mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
        await mongoose.connect(mongod.getUri(), { dbName: 'mika' });
        store = require('../src/guess/store');
        GuessPlayer = require('../src/Models/GuessPlayer');
        await GuessPlayer.init();
    });
    after(async () => {
        if (mongoose) await mongoose.disconnect();
        if (mongod) await mongod.stop();
    });
    beforeEach(async () => { await GuessPlayer.deleteMany({}); });

    test('a daily claim pays once per 24 hours, even when claimed twice at once', async () => {
        const now = Date.parse('2026-11-26T09:00:00-08:00');
        const first = await store.claimDaily(USER, GUILD, now);
        assert.deepEqual(first, { ok: true, amount: GUESS_DAILY_CRYSTALS, balance: GUESS_DAILY_CRYSTALS });
        assert.deepEqual(await store.claimDaily(USER, GUILD, now + DAY - 1), { ok: false, nextAt: now + DAY });
        const later = now + DAY;
        const both = await Promise.all([store.claimDaily(USER, GUILD, later), store.claimDaily(USER, GUILD, later)]);
        assert.equal(both.filter((result) => result.ok).length, 1);
        assert.equal((await store.readPlayer(USER, GUILD)).crystals, GUESS_DAILY_CRYSTALS * 2);
        await assert.rejects(store.claimDaily('nope', GUILD, now), TypeError);
    });

    test('a first claim racing a new player document still pays exactly once', async () => {
        const now = Date.parse('2026-11-26T09:00:00-08:00');
        const both = await Promise.all([store.claimDaily(USER, GUILD, now), store.claimDaily(USER, GUILD, now)]);
        assert.equal(both.filter((result) => result.ok).length, 1);
        assert.equal(both.find((result) => !result.ok).nextAt, now + DAY);
        await GuessPlayer.create({ userID: '223456789012345679', guildID: GUILD, crystals: 100, wins: 3 });
        const existing = await store.claimDaily('223456789012345679', GUILD, now);
        assert.equal(existing.balance, 100 + GUESS_DAILY_CRYSTALS);
    });
});

test('replenish fills in popularity for titles saved before difficulty tiers', async () => {
    const store = require('../src/guess/store');
    const { replenish } = require('../src/guess/select');
    store.resetCache();
    const old = { id: '77', idMal: 77, titles: { english: 'Old Show' }, status: 'FINISHED', genres: ['Drama'],
        guessContextVersion: 2, relatedIds: [] };
    await store.saveAnime(old, ['https://shikimori.io/old.jpg'], Date.now());
    assert.equal((await store.listPool()).find((row) => row.anilistId === '77').popularity, null);
    const asked = [];
    await replenish({
        randomAnime: async () => ({ unavailable: true }),
        getContext: async (id) => { asked.push(id); return { popularity: 12345 }; },
    });
    assert.deepEqual(asked, ['77']);
    const row = (await store.listPool()).find((entry) => entry.anilistId === '77');
    assert.equal(row.popularity, 12345);
    assert.equal(tierOf('hard').test(row), true);
    store.resetCache();
});
