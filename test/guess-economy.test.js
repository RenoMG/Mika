const assert = require('node:assert/strict');
const { test, describe, before, after, beforeEach } = require('node:test');
const { createRegistry, evaluateGuess, startRound } = require('../src/guess/round');
const { createLocks } = require('../src/guess/lock');
const { hintRow, hintData, letterPattern } = require('../src/guess/hints');
const { winTotal, wagerReturn, crystalReward, rewardLabel } = require('../src/guess/rewards');
const { createCharacterJudge, characterRound } = require('../src/guess/characters');
const { packOf, packChoices } = require('../src/guess/packs');
const { seasonKey, dayKey, seasonLabel, titleText, titleBadge } = require('../src/guess/season');
const { ACHIEVEMENTS, pending } = require('../src/guess/achievements');
const { isStale } = require('../src/guess/policy');
const { GUESS_STATUS_TTL_MS, GUESS_GIFT_DAILY_MAX } = require('../src/guess/constants');
const { characterFrom } = require('../src/anime/client');
const { buildGuessBoard } = require('../src/guess/board');
const { replayRow } = require('../src/guess/replay');

const USER = '323456789012345678';
const OTHER = '223456789012345679';
const THIRD = '223456789012345680';
const GUILD = '123456789012345678';
const CHANNEL = '423456789012345678';
const PROMPT = '523456789012345678';
const SHOT = 'https://shikimori.io/a.jpg';
const media = { id: '1', titles: { english: 'Cowboy Bebop' }, genres: ['Action'], studios: ['Sunrise'] };
const DAY = 24 * 60 * 60 * 1000;

function hub(t) {
    const events = {}; const reveals = [];
    const registry = createRegistry(); t.after(() => registry.clear());
    const channel = { createMessageCollector: () => ({ on: (key, fn) => { events[key] = fn; }, stop() {} }) };
    return { events, reveals, registry, channel };
}

test('seasons are Pacific quarters, and titles read as medals', () => {
    assert.equal(seasonKey(Date.parse('2026-03-31T23:00:00-07:00')), '2026-Q1');
    assert.equal(seasonKey(Date.parse('2026-04-01T00:30:00-07:00')), '2026-Q2');
    assert.equal(seasonKey(Date.parse('2027-01-01T07:59:00Z')), '2026-Q4');
    assert.equal(dayKey(Date.parse('2026-11-26T07:59:00Z')), '2026-11-25');
    assert.equal(seasonLabel('2026-Q4'), 'Q4 2026');
    assert.equal(titleText({ season: '2026-Q3', rank: 2 }), '🥈 Q3 2026 Runner-up');
    assert.equal(titleBadge([{ season: '2026-Q1', rank: 1 }, { season: '2026-Q3', rank: 3 }]), '🥉');
    assert.equal(titleBadge([]), '');
});

test('airing shows go stale in a week, finished ones keep for a year', () => {
    const now = Date.now();
    assert.equal(isStale(new Date(now - 8 * DAY), now, 'RELEASING'), true);
    assert.equal(isStale(new Date(now - 6 * DAY), now, 'RELEASING'), false);
    assert.equal(isStale(new Date(now - 200 * DAY), now, 'FINISHED'), false);
    assert.equal(isStale(new Date(now - GUESS_STATUS_TTL_MS.FINISHED - 1), now, 'FINISHED'), true);
    assert.equal(isStale(new Date(now - 31 * DAY), now, ''), true);
});

test('letter reveal keeps the first letter of each word and the punctuation', () => {
    assert.equal(letterPattern('Cowboy Bebop'), 'C _ _ _ _ _   B _ _ _ _');
    assert.equal(letterPattern('Re:Zero 2'), 'R _ : _ _ _ _   2');
    assert.match(hintData({ media }, 'letters'), /^```\nC _/);
    assert.equal(hintData({ media: {} }, 'letters'), '');
    const character = { kind: 'character', character: { name: 'Levi Ackerman', animeTitle: 'Attack on Titan' } };
    assert.equal(hintData(character, 'anime'), 'Attack on Titan');
    assert.equal(hintData(character, 'genre'), '');
    const row = hintRow(character).toJSON().components.map((button) => button.custom_id);
    assert.deepEqual(row, ['guess:hint:anime', 'guess:hint:letters', 'guess:giveup']);
});

test('wager wins return the stake doubled, cut by hints like the base reward', () => {
    assert.equal(wagerReturn({ wager: 100 }), 200);
    assert.equal(winTotal({ wager: 100 }), 250);
    const hinted = { wager: 100, purchasedHints: new Set(['genre', 'studio']) };
    assert.equal(wagerReturn(hinted), 150);
    assert.equal(winTotal(hinted), crystalReward(hinted) + 150);
    assert.match(rewardLabel({ wager: 40 }), /80\*\* 💎 back from your \*\*40\*\* 💎 wager/);
    assert.equal(winTotal({}), 50);
});

test('character answers accept either name order, one name, aliases and small typos', () => {
    const judge = createCharacterJudge({ name: 'Levi Ackerman', native: 'リヴァイ', alternative: ['Captain Levi'], animeTitle: 'Attack on Titan' });
    for (const guess of ['Levi', 'levi ackerman', 'Ackerman Levi', 'リヴァイ', 'captain levi', 'Levi Akerman']) {
        assert.equal(judge(guess).kind, 'correct', guess);
    }
    assert.deepEqual(judge('Attack on Titan'), { kind: 'close', hint: 'character' });
    assert.equal(judge('Eren').kind, 'wrong');
    assert.equal(judge('').kind, 'wrong');
    const round = characterRound({ characterId: '45627', name: 'Levi Ackerman', image: 'https://s4.anilist.co/x.png' });
    assert.equal(round.kind, 'character');
    assert.equal(round.url, 'https://s4.anilist.co/x.png');
});

test('AniList characters need an image and a non-adult anime', () => {
    const node = { id: 1, favourites: 9, name: { full: 'Spike Spiegel', native: 'スパイク', alternative: ['Spike'] },
        image: { large: 'https://s4.anilist.co/file/1.png' },
        media: { nodes: [{ id: 1, isAdult: false, title: { english: 'Cowboy Bebop' } }] } };
    assert.equal(characterFrom(node).animeTitle, 'Cowboy Bebop');
    assert.equal(characterFrom({ ...node, image: { large: 'https://s4.anilist.co/default.jpg' } }), null);
    assert.equal(characterFrom({ ...node, image: { large: 'https://evil.example/1.png' } }), null);
    assert.equal(characterFrom({ ...node, media: { nodes: [{ id: 2, isAdult: true, title: { romaji: 'X' } }] } }), null);
    assert.equal(characterFrom({ ...node, media: { nodes: [] } }), null);
});

test('packs filter by genre or start year and fit in one Discord choice list', () => {
    assert.ok(packChoices().length <= 25);
    const nineties = packOf('era-90s');
    assert.equal(nineties.test({ year: 1998 }), true);
    assert.equal(nineties.test({ year: 2001 }), false);
    assert.equal(nineties.test({ year: null }), false);
    assert.equal(packOf('mecha').test({ genres: ['Mecha', 'Action'] }), true);
    assert.equal(packOf('__proto__'), null);
    assert.equal(packOf('nope'), null);
});

test('achievements are listed once and test player rows', () => {
    assert.equal(new Set(ACHIEVEMENTS.map((entry) => entry.id)).size, ACHIEVEMENTS.length);
    const player = { wins: 10, bestStreak: 5, achievements: ['first_win'], packsWon: [],
        counters: { noHintWins: 0, fastWins: 1, wagerWins: 0, bigWagerWins: 0, duelWins: 0, characterWins: 0, giftedTotal: 0, shieldsUsed: 0 } };
    assert.deepEqual(pending(player).map((entry) => entry.id), ['wins_10', 'streak_5', 'speed_1']);
});

test('the leaderboard shows the period, a season note, and title badges', () => {
    const view = buildGuessBoard({ guildName: 'Mika', period: 'Q4 2026 season', note: 'Season ends Dec 31, 2026.',
        entries: [{ userID: USER, username: 'reno', wins: 3, position: 1, titles: [{ season: '2026-Q3', rank: 1 }] }] });
    const embed = view.embeds[0].data;
    assert.match(embed.title, /Q4 2026 season/);
    assert.match(embed.description, /🥇 · \*\*3\*\* wins/);
    assert.match(embed.description, /Season ends/);
    const empty = buildGuessBoard({ guildName: 'Mika', period: 'Q4 2026 season', entries: [] });
    assert.match(empty.embeds[0].data.description, /this season/);
});

test('Play again repeats a character or pack round, never a wager', () => {
    const id = (round) => replayRow(round, 1_700_000_000_000).toJSON().components[0].custom_id;
    assert.match(id({ manual: true, userId: USER, kind: 'character' }), /:c$/);
    assert.match(id({ manual: true, userId: USER, pack: { id: 'era-90s' }, wager: 50 }), /:p-era-90s$/);
    assert.match(id({ manual: true, userId: USER, wager: 50 }), /:\d{13}$/);
    assert.match(id({ manual: false, kind: 'character' }), /^guess:replay:0:\d{13}$/);
});

test('a wager and pack fee are charged together and refunded when no round starts', async () => {
    const spent = []; const refunded = []; const plays = [];
    const base = {
        channelId: CHANNEL, guildId: GUILD, userId: USER, manual: true, locks: createLocks(),
        peekAndConsume: async () => ({ allowed: true, stamp: 7, remaining: 5 }),
        refund: async (...args) => plays.push(args),
        spend: async (...args) => { spent.push(args); return true; },
        refundGems: async (...args) => refunded.push(args),
        send: async () => ({ id: PROMPT }),
        wager: 100, pack: packOf('mecha'), packCost: 20,
    };
    const failed = await startRound({ ...base, choose: async () => ({ ok: false, empty: true }) });
    assert.equal(failed.ok, false);
    assert.deepEqual(spent, [[USER, GUILD, 120]]);
    assert.deepEqual(refunded, [[USER, GUILD, 120]]);
    assert.deepEqual(plays, [[USER, GUILD, 7]]);

    const broke = await startRound({ ...base, spend: async () => false, choose: async () => assert.fail('no round') });
    assert.equal(broke.broke, true);
    assert.equal(broke.needed, 120);

    let attached; let chooseOptions;
    const ok = await startRound({ ...base, choose: async (_guild, options) => { chooseOptions = options; return { ok: true, media, url: SHOT, screenshots: [] }; },
        attach: (round) => { attached = round; }, refundGems: async () => assert.fail('a live round keeps the stake') });
    assert.equal(ok.ok, true);
    assert.equal(chooseOptions.pack.id, 'mecha');
    assert.equal(attached.wager, 100);
    assert.equal(attached.pack.id, 'mecha');

    let sentPayload;
    const character = await startRound({ ...base, wager: 0, pack: null, kind: 'character', locks: createLocks(),
        chooseCharacter: async () => ({ ok: true, ...characterRound({ characterId: '9', name: 'Faye Valentine', image: 'https://s4.anilist.co/f.png' }) }),
        send: async (payload) => { sentPayload = payload; return { id: PROMPT }; } });
    assert.equal(character.kind, 'character');
    assert.match(sentPayload.embeds[0].data.title, /Guess That Character/);
});

test('a lost wager says so, and a held shield saves the streak', async (t) => {
    const h = hub(t);
    h.registry.watch(h.channel, { manual: true, userId: USER, ownerName: 'Reno', guildId: GUILD, channelId: CHANNEL,
        promptId: PROMPT, media, url: SHOT, wager: 60 }, {
        announce: async (body) => h.reveals.push(body),
        endStreak: async () => ({ shielded: true, streak: 4 }),
    });
    await h.events.end([], 'time');
    assert.match(h.reveals[0].content, /60\*\* 💎 wager is gone/);
    assert.match(h.reveals[0].content, /Streak Shield saved your 🔥 \*\*4\*\* streak/);
});

test('a won wager pays base plus double the stake, and fast wins are counted', async (t) => {
    const h = hub(t); const awards = [];
    h.registry.watch(h.channel, { manual: true, userId: USER, guildId: GUILD, channelId: CHANNEL, promptId: PROMPT, media, url: SHOT, wager: 300 }, {
        announce: async (body) => h.reveals.push(body),
        award: async (...args) => { awards.push(args); return { streak: 1 }; },
        unlock: async () => [ACHIEVEMENTS.find((entry) => entry.id === 'high_roller')],
    });
    await h.events.collect({ id: 'g', channelId: CHANNEL, author: { id: USER, username: 'Reno' }, content: 'Cowboy Bebop' });
    assert.equal(awards[0][2], 650);
    assert.equal(awards[0][3].counters.bigWagerWins, 1);
    assert.equal(awards[0][3].counters.fastWins, 1);
    assert.match(h.reveals[0].content, /\+650\*\* 💎/);
    assert.match(h.reveals[0].content, /High Roller/);
});

test('duel rounds only take answers from the two duelists and pay the winner the pot', async (t) => {
    const h = hub(t); const settled = []; const refunds = [];
    const hooks = { announce: async (body) => h.reveals.push(body), settleDuel: async (...args) => settled.push(args),
        refundCrystals: async (...args) => refunds.push(args), unlock: async () => [] };
    const duel = h.registry.watch(h.channel, { key: 'duel:x', lockKey: 'duel:x', guildId: GUILD, channelId: CHANNEL,
        promptId: PROMPT, media, url: SHOT, duel: { players: [USER, OTHER], stake: 50 } }, hooks);
    const message = (author, content, extra = {}) => ({ id: 'm', channelId: CHANNEL, author: { id: author, username: 'x' }, content, ...extra });
    assert.equal(evaluateGuess([duel], message(THIRD, 'Cowboy Bebop')), null);
    assert.equal(evaluateGuess([duel], message(THIRD, 'Cowboy Bebop', { reference: { messageId: PROMPT } })), null);
    assert.equal(evaluateGuess([duel], message(OTHER, 'Cowboy Bebop')).kind, 'correct');
    await h.events.collect(message(OTHER, 'Cowboy Bebop'));
    assert.deepEqual(settled, [[OTHER, USER, GUILD, 100]]);
    assert.match(h.reveals[0].content, /wins the duel! .*\+100\*\* 💎/);
    assert.deepEqual(refunds, []);

    const draw = hub(t);
    draw.registry.watch(draw.channel, { key: 'duel:y', lockKey: 'duel:y', guildId: GUILD, channelId: CHANNEL,
        promptId: PROMPT, media, url: SHOT, duel: { players: [USER, OTHER], stake: 50 } },
    { ...hooks, announce: async (body) => draw.reveals.push(body), endStreak: async () => assert.fail('duels keep streaks') });
    await draw.events.end([], 'time');
    assert.deepEqual(refunds, [[USER, GUILD, 50], [OTHER, GUILD, 50]]);
    assert.match(draw.reveals[0].content, /Both stakes were returned/);
});

describe('guess economy storage', { concurrency: false }, () => {
    let mongoose; let mongod; let store; let GuessPlayer;

    before(async () => {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        mongoose = require('mongoose');
        mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
        await mongoose.connect(mongod.getUri(), { dbName: 'mika' });
        store = require('../src/guess/store');
        GuessPlayer = require('../src/Models/GuessPlayer');
    }, { timeout: 180000 });

    after(async () => {
        if (mongoose) await mongoose.disconnect();
        if (mongod) await mongod.stop();
    });

    beforeEach(async () => {
        store.resetSeasonCache();
        await GuessPlayer.deleteMany({});
        await require('../src/Models/GuessGuild').deleteMany({});
    });

    test('a new season hands the top three a title before anyone starts over', async () => {
        const q3 = Date.parse('2026-08-01T12:00:00-07:00');
        const q4 = Date.parse('2026-10-02T12:00:00-07:00');
        const wins = { [USER]: 3, [OTHER]: 5, [THIRD]: 1, '223456789012345681': 2 };
        for (const [id, count] of Object.entries(wins)) {
            for (let i = 0; i < count; i++) await store.awardWin(id, GUILD, 50, { now: q3 });
        }
        let row = await store.readPlayer(OTHER, GUILD, q3);
        assert.equal(row.season, '2026-Q3');
        assert.equal(row.seasonWins, 5);
        assert.equal((await store.leaderboardDocs(GUILD, { season: '2026-Q3' }))[0].userID, OTHER);

        store.resetSeasonCache();
        await store.awardWin(THIRD, GUILD, 50, { now: q4 });
        assert.deepEqual((await store.readPlayer(OTHER, GUILD, q4)).titles, [{ season: '2026-Q3', rank: 1 }]);
        assert.deepEqual((await store.readPlayer(USER, GUILD, q4)).titles, [{ season: '2026-Q3', rank: 2 }]);
        assert.deepEqual((await store.readPlayer('223456789012345681', GUILD, q4)).titles, [{ season: '2026-Q3', rank: 3 }]);
        row = await store.readPlayer(THIRD, GUILD, q4);
        assert.deepEqual(row.titles, []);
        assert.equal(row.seasonWins, 1);
        assert.equal(row.wins, 2);
        assert.equal((await store.readPlayer(OTHER, GUILD, q4)).seasonWins, 0);
        // Closing again never doubles titles.
        store.resetSeasonCache();
        await store.closeSeason(GUILD, q4);
        assert.equal((await store.readPlayer(OTHER, GUILD, q4)).titles.length, 1);
        const board = await store.leaderboardDocs(GUILD, { season: '2026-Q4' });
        assert.deepEqual(board.map((entry) => entry.userID), [THIRD]);
    });

    test('a Streak Shield is bought once, and saves the streak a single time', async () => {
        await GuessPlayer.create({ userID: USER, guildID: GUILD, crystals: 100, streak: 3 });
        assert.deepEqual(await store.buyShield(USER, GUILD), { ok: true });
        assert.deepEqual(await store.buyShield(USER, GUILD), { ok: false, owned: true });
        assert.deepEqual(await store.endStreak(USER, GUILD, { gaveUp: true }), { shielded: true, streak: 3 });
        let row = await store.readPlayer(USER, GUILD);
        assert.equal(row.shields, 0);
        assert.equal(row.streak, 3);
        assert.equal(row.gaveUp, 1);
        assert.equal(row.counters.shieldsUsed, 1);
        assert.deepEqual(await store.endStreak(USER, GUILD), { shielded: false, streak: 0 });
        row = await store.readPlayer(USER, GUILD);
        assert.equal(row.streak, 0);
        assert.deepEqual(await store.buyShield(USER, GUILD), { ok: false, short: 50 });
    });

    test('gifts need five wins, a balance, and stay under the daily cap', async () => {
        const now = Date.parse('2026-11-25T12:00:00-08:00');
        await GuessPlayer.create({ userID: USER, guildID: GUILD, crystals: 1000, wins: 4 });
        assert.equal((await store.giftCrystals(USER, OTHER, GUILD, 10, now)).wins, true);
        await GuessPlayer.updateOne({ userID: USER, guildID: GUILD }, { $set: { wins: 5 } });
        assert.deepEqual(await store.giftCrystals(USER, OTHER, GUILD, 300, now), { ok: true });
        assert.deepEqual(await store.giftCrystals(USER, OTHER, GUILD, 300, now), { ok: false, cap: true, left: 200 });
        assert.deepEqual(await store.giftCrystals(USER, OTHER, GUILD, 200, now), { ok: true });
        assert.equal((await store.readPlayer(OTHER, GUILD)).crystals, 500);
        const tomorrow = now + DAY;
        assert.deepEqual(await store.giftCrystals(USER, OTHER, GUILD, 400, tomorrow), { ok: true });
        assert.deepEqual(await store.giftCrystals(USER, OTHER, GUILD, 101, tomorrow), { ok: false, short: true, balance: 100 });
        const sender = await store.readPlayer(USER, GUILD);
        assert.equal(sender.crystals, 100);
        assert.equal(sender.counters.giftedTotal, 900);
        await assert.rejects(store.giftCrystals(USER, USER, GUILD, 1, now), TypeError);
        await assert.rejects(store.giftCrystals(USER, OTHER, GUILD, GUESS_GIFT_DAILY_MAX + 1, now), TypeError);
    });

    test('achievements pay out once, and duels change crystals but not wins', async () => {
        await store.awardWin(USER, GUILD, 50, { streak: true, counters: { fastWins: 1, bogus$: 5 }, pack: 'mecha' });
        const first = await store.unlockAchievements(USER, GUILD);
        assert.deepEqual(first.map((entry) => entry.id), ['first_win', 'speed_1']);
        assert.deepEqual(await store.unlockAchievements(USER, GUILD), []);
        let row = await store.readPlayer(USER, GUILD);
        assert.equal(row.crystals, 50 + 25 + 50);
        assert.deepEqual(row.packsWon, ['mecha']);

        await store.settleDuel(OTHER, USER, GUILD, 100);
        const winner = await store.readPlayer(OTHER, GUILD);
        assert.equal(winner.crystals, 100);
        assert.equal(winner.wins, 0);
        assert.equal(winner.counters.duelWins, 1);
        row = await store.readPlayer(USER, GUILD);
        assert.equal(row.counters.duelLosses, 1);
        assert.equal(row.streak, 1);
    });
});

test('a duel holds stakes, refunds on decline, and starts one shared round on accept', async (t) => {
    const { createDuel, handleDuel, resetDuels } = require('../src/guess/duel');
    t.after(resetDuels);
    const BOT = '623456789012345678';
    const ledger = [];
    let balance = { [USER]: 100, [OTHER]: 30 };
    const deps = {
        spend: async (id, _g, amount) => { if (balance[id] < amount) return false; balance[id] -= amount; ledger.push(['spend', id, amount]); return true; },
        refund: async (id, _g, amount) => { balance[id] += amount; ledger.push(['refund', id, amount]); },
        setTimer: () => 1, clearTimer: () => {},
    };
    const edits = [];
    const sentPrompts = [];
    const message = { id: 'challenge', edit: async (body) => edits.push(body) };
    const channel = { id: CHANNEL, send: async (body) => { sentPrompts.push(body); return { id: PROMPT }; } };
    const command = () => ({ guild: { id: GUILD }, user: { id: USER, username: 'reno' }, member: { displayName: 'Reno' },
        channelId: CHANNEL, channel, deferred: true, replies: [],
        editReply: async function (body) { this.replies.push(body); return message; }, followUp: async function (body) { this.replies.push(body); } });
    const button = (action, id, user) => ({ customId: `guess:duel:${action}:${id}`, guild: { id: GUILD }, user: { id: user }, replies: [],
        deferUpdate: async () => {}, reply: async function (body) { this.replies.push(body); }, followUp: async function (body) { this.replies.push(body); } });
    const client = { user: { id: BOT }, options: { intents: { has: () => true } } };

    const first = await createDuel({ interaction: command(), opponent: { id: OTHER }, opponentName: 'Kaz', stake: 50, deps });
    assert.equal(balance[USER], 50);
    const busy = command();
    await createDuel({ interaction: busy, opponent: { id: THIRD }, opponentName: 'Sam', stake: 10, deps });
    assert.match(busy.replies.at(-1).content, /already have a duel/);
    const stranger = button('accept', first.id, THIRD);
    await handleDuel(stranger, client);
    assert.match(stranger.replies[0].content, /Only the challenged member/);
    const poor = button('accept', first.id, OTHER);
    await handleDuel(poor, client);
    assert.match(poor.replies[0].content, /need \*\*50\*\*/);
    await handleDuel(button('decline', first.id, OTHER), client);
    assert.equal(balance[USER], 100);
    assert.match(edits.at(-1).embeds[0].data.description, /declined/);

    balance = { [USER]: 100, [OTHER]: 80 };
    const second = await createDuel({ interaction: command(), opponent: { id: OTHER }, opponentName: 'Kaz', stake: 50, deps });
    let watched;
    await handleDuel(button('accept', second.id, OTHER), client, {
        locks: createLocks(),
        choose: async () => ({ ok: true, media, url: SHOT, screenshots: [] }),
        watch: (_channel, round) => { watched = round; },
    });
    assert.equal(balance[USER], 50);
    assert.equal(balance[OTHER], 30);
    assert.deepEqual(watched.duel, { players: [USER, OTHER], stake: 50 });
    assert.equal(sentPrompts.length, 1);
    assert.deepEqual(sentPrompts[0].allowedMentions, { users: [USER, OTHER] });

    balance = { [USER]: 100, [OTHER]: 80 };
    const third = await createDuel({ interaction: command(), opponent: { id: OTHER }, opponentName: 'Kaz', stake: 20, deps });
    await handleDuel(button('accept', third.id, OTHER), client, { locks: createLocks(), choose: async () => ({ ok: false, empty: true }) });
    assert.deepEqual(balance, { [USER]: 100, [OTHER]: 80 });
});
