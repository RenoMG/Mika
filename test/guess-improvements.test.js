const assert = require('node:assert/strict');
const { test } = require('node:test');
const { classifyGuess } = require('../src/guess/match');
const { RESPONSES } = require('../src/guess/feedback');
const { evaluateGuess, createRegistry, startRound, roundLockKey } = require('../src/guess/round');
const { createLocks } = require('../src/guess/lock');
const { handleReplay, replayRow, REPLAY_MS } = require('../src/guess/replay');
const { createWorkQueue } = require('../src/guess/queue');
const { createScheduler, initialSpread } = require('../src/guess/scheduler');
const { intervalMinutes } = require('../src/guess/settings');
const { createMaintenance } = require('../src/guess/maintenance');
const { createCache } = require('../src/anime/cache');
const { createClient } = require('../src/anime/client');
const { fetchScreenshots } = require('../src/guess/shikimori');
const { loadPageNames } = require('../src/guess/names');
const { onBoardClick, NEXT_ID } = require('../src/guess/board');
const USER = '323456789012345678';
const OTHER = '223456789012345679';
const BOT = '623456789012345678';
const GUILD = '123456789012345678';
const CHANNEL = '423456789012345678';
const PROMPT = '523456789012345678';
const movie = { id: '1', format: 'MOVIE', titles: {
    english: 'Demon Slayer: Kimetsu no Yaiba - The Movie: Mugen Train',
    romaji: 'Kimetsu no Yaiba: Mugen Ressha-hen', native: '鬼滅の刃 無限列車編',
}, synonyms: ['Demon Slayer', 'Mugen Train'], relatedTitles: ['Demon Slayer: Kimetsu no Yaiba', 'Kimetsu no Yaiba'] };
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
function message(content, extra = {}) { return { id: String(Math.random()), channelId: CHANNEL, content, author: { id: USER }, ...extra }; }
function config(minutes = 10) { return { GuessStatus: [{ Status: 'true' }], GuessChannel: [{ Channel: CHANNEL }], GuessInterval: [{ Minutes: String(minutes) }] }; }

class Clock {
    time = 0; seq = 0; timers = new Map();
    now = () => this.time;
    setTimer = (fn, ms) => { const id = ++this.seq; this.timers.set(id, { at: this.time + ms, fn }); return id; };
    clearTimer = (id) => this.timers.delete(id);
    async advance(ms) {
        const end = this.time + ms;
        for (;;) {
            const next = [...this.timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            this.time = next[1].at;
            this.timers.delete(next[0]);
            next[1].fn();
            await flush();
        }
        this.time = end;
        await flush();
    }
}

test('movie feedback distinguishes the franchise, exact titles, aliases and unrelated chat', () => {
    for (const guess of ['Demon Slayer', 'Demom Slayer', 'Kimetsu no Yaiba', 'Demon Slayer: Kimetsu no Yaiba']) {
        assert.deepEqual(classifyGuess(guess, movie), { kind: 'close', hint: 'movie' }, guess);
    }
    for (const guess of [movie.titles.english, movie.titles.native, 'Mugen Train', 'Mugen Trsin']) {
        assert.equal(classifyGuess(guess, movie).kind, 'correct', guess);
    }
    for (const guess of ['the movie', 'season 2', 'Naruto', 'I love Demon Slayer', 'a', 'x'.repeat(121)]) {
        assert.equal(classifyGuess(guess, movie).kind, 'wrong', guess);
    }
    for (const list of Object.values(RESPONSES)) for (const text of list) assert.doesNotMatch(text, /[—–]/);
});

test('season and part numbers cannot be accepted as typos; ordinary typos still work', () => {
    const season = { titles: { english: 'Example Anime Season 3' } };
    assert.equal(classifyGuess('Example Anime Season 2', season).kind, 'close');
    assert.equal(classifyGuess('Example Anime Season III', season).kind, 'correct');
    assert.equal(classifyGuess('Example Anime 3rd Season', season).kind, 'correct');
    assert.equal(classifyGuess('Examplr Anime Season 3', season).kind, 'correct');
    assert.equal(classifyGuess('Example Anime Part II', { titles: { english: 'Example Anime Part III' } }).kind, 'close');
    assert.equal(classifyGuess('FMA', { titles: { english: 'FMA' } }).kind, 'correct');
    assert.equal(classifyGuess('FM', { titles: { english: 'FMA' } }).kind, 'wrong');
    assert.equal(classifyGuess('Shingeki no Kyojin', { titles: { romaji: 'Shingeki no Kyōjin' } }).kind, 'correct');
});

test('a correct auto answer wins before a personal hint; an explicit reply targets its own round', () => {
    const personal = { key: 'personal', manual: true, userId: USER, channelId: CHANNEL, media: movie, promptId: PROMPT };
    const auto = { key: 'auto', channelId: CHANNEL, media: { titles: { english: 'Demon Slayer' } }, promptId: '723456789012345678' };
    assert.equal(evaluateGuess([personal, auto], message('Demon Slayer')).round.key, 'auto');
    assert.equal(evaluateGuess([personal, auto], message('Demon Slayer', { reference: { messageId: PROMPT } })).kind, 'close');
    assert.equal(evaluateGuess([personal, auto], message('Naruto')), null);
    assert.equal(evaluateGuess([personal, auto], message('Naruto', { reference: { messageId: PROMPT } })).kind, 'wrong');
    assert.equal(evaluateGuess([personal, auto], message('Demon Slayer', { reference: { messageId: 'unrelated' } })), null);
    assert.equal(evaluateGuess([personal], message('Demon Slayer', { author: { id: OTHER }, reference: { messageId: PROMPT } })), null);
});

test('hints are public direct replies, cooldowns do not block wins, and finished rounds stay quiet', async () => {
    const events = {}; const replies = []; const announcements = []; let awards = 0; let now = 10000;
    const registry = createRegistry(); const locks = createLocks();
    const key = roundLockKey({ channelId: CHANNEL, manual: true, userId: USER }); locks.acquire(key);
    const collector = { on: (name, fn) => { events[name] = fn; }, stop() {}, collected: new Map() };
    const channel = { createMessageCollector: () => collector };
    registry.watch(channel, { key, lockKey: key, manual: true, userId: USER, channelId: CHANNEL, guildId: GUILD,
        media: movie, promptId: PROMPT }, { locks, now: () => now, random: () => 0,
        award: async () => { awards++; }, announce: async (body) => { announcements.push(body); } });
    const guess = message('Demon Slayer', { reply: async (body) => { replies.push(body); return { id: '823456789012345678' }; } });
    await events.collect(guess); await events.collect(guess);
    assert.equal(replies.length, 1); assert.equal(replies[0].flags, undefined);
    assert.equal(replies[0].allowedMentions.repliedUser, false);
    now += 3100; await events.collect(guess);
    assert.equal(replies.length, 2); assert.notEqual(replies[0].content, replies[1].content);
    await events.collect(message('Mugen Train', { reference: { messageId: '823456789012345678' } })); await events.collect(guess);
    assert.equal(awards, 1); assert.equal(replies.length, 2);
    const button = announcements[0].components[0].toJSON().components[0];
    assert.equal(button.label, 'Play again'); assert.equal(button.emoji.name, '🎲');
    assert.equal(locks.held(key), false); registry.clear();
});

test('final personal rounds show Last guess and omit replay after wins and timeouts', async () => {
    for (const manual of [true, false]) {
        for (const remaining of [0, 1]) {
            for (const outcome of ['win', 'timeout']) {
                const events = {}; const announcements = []; const prompts = [];
                const registry = createRegistry(); const locks = createLocks();
                const channel = { createMessageCollector: () => ({
                    on: (name, fn) => { events[name] = fn; }, stop() {},
                }) };
                try {
                    const round = await startRound({ channelId: CHANNEL, guildId: GUILD, userId: USER, manual, locks,
                        peekAndConsume: async () => ({ allowed: true, remaining, stamp: 1 }),
                        choose: async () => ({ ok: true, media: movie, url: 'https://shikimori.io/a.jpg' }),
                        send: async (payload) => { prompts.push(payload); return { id: PROMPT }; },
                        attach: (round) => registry.watch(channel, round, { locks, award: async () => {},
                            announce: async (payload) => announcements.push(payload) }),
                    });
                    assert.equal(round.ok, true);
                    const last = manual && remaining === 0;
                    assert.equal(prompts[0].embeds[0].data.footer.text.endsWith('Last round this hour'), last);
                    if (outcome === 'win') {
                        await events.collect(message('Mugen Train'));
                        await flush();
                    } else await events.end([], 'time');
                    assert.equal(announcements.length, 1);
                    assert.equal(announcements[0].components.length, last ? 0 : 1);
                    assert.equal(locks.held(round.lockKey), false);
                } finally { registry.clear(); }
            }
        }
    }
});

test('a round caps public feedback and safely handles a deleted guessed message', async () => {
    const events = {}; let calls = 0; let now = 10000;
    const registry = createRegistry();
    registry.watch({ createMessageCollector: () => ({ on: (key, fn) => { events[key] = fn; }, stop() {} }) },
        { channelId: CHANNEL, guildId: GUILD, media: movie }, { now: () => now });
    const original = console.error; console.error = () => {};
    try {
        for (let i = 0; i < 20; i++) { now += 3100; await events.collect(message('Demon Slayer', { reply: async () => { calls++; throw Error('deleted'); } })); }
        assert.equal(calls, 8);
    } finally { console.error = original; registry.clear(); }
});

function replayInteraction(owner = USER) {
    const now = Date.now(); const replies = []; const edits = [];
    return { customId: replayRow({ manual: owner !== '0', userId: owner }, now).toJSON().components[0].custom_id,
        guild: { id: GUILD }, channel: { id: CHANNEL, permissionsFor: () => ({ has: () => true }) }, channelId: CHANNEL, user: { id: USER },
        message: { author: { id: BOT }, edit: async (body) => edits.push(body) }, replies, edits,
        async deferReply() { this.deferred = true; }, async editReply(body) { replies.push(body); },
        async reply(body) { replies.push(body); }, async followUp(body) { replies.push(body); }, async deleteReply() {},
    };
}
test('replay rejects other owners, expired controls and restricted channels', async () => {
    let played = 0; const client = { user: { id: BOT } };
    const deps = { play: async () => { played++; }, readConfig: async () => ({ DisabledChannels: [{ Channels: CHANNEL }] }) };
    const other = replayInteraction(OTHER); await handleReplay(other, client, deps);
    assert.match(other.replies[0].content, /their round/);
    const expired = replayInteraction(); await handleReplay(expired, client, { ...deps, now: () => Date.now() + REPLAY_MS + 100 });
    assert.match(expired.replies[0].content, /expired/);
    const restricted = replayInteraction(); await handleReplay(restricted, client, deps);
    assert.match(restricted.replies[0].content, /turned commands off/i); assert.equal(played, 0);
});

test('replay reuses the normal quota and round lock, and auto reveals start personal rounds', async () => {
    const command = require('../src/commands/guess/guess'); const client = { user: { id: BOT }, options: { intents: { has: () => true } } };
    let consumed = 0; let sent = 0; const locks = createLocks();
    const play = (interaction, bot) => command.play(interaction, bot, { watchChannel() {},
        startRound: (args) => startRound({ ...args, locks,
            peekAndConsume: async () => { consumed++; return { allowed: consumed <= 1, stamp: 1, nextAt: Date.now() + 1000 }; },
            choose: async () => ({ ok: true, media: movie, url: 'https://shikimori.io/a.jpg' }),
            send: async () => { sent++; return { id: PROMPT }; },
        }) });
    const first = replayInteraction('0');
    const round = await handleReplay(first, client, { play, readConfig: async () => ({}) });
    assert.equal(round.manual, true); assert.equal(round.userId, USER); assert.equal(round.promptId, PROMPT);
    await handleReplay(replayInteraction(), client, { play, readConfig: async () => ({}) });
    assert.equal(consumed, 1); assert.equal(sent, 1); // Busy round does not charge another play.
    locks.release(round.lockKey);
    const limited = replayInteraction(); await handleReplay(limited, client, { play, readConfig: async () => ({}) });
    assert.equal(consumed, 2); assert.equal(sent, 1); assert.match(limited.replies[0].content, /hour/i);
    const successful = replayInteraction(); await handleReplay(successful, client, { play: async () => ({ ok: true }), readConfig: async () => ({}) });
    assert.equal(successful.edits[0].components[0].toJSON().components[0].disabled, true);
});

test('scheduler supports 10 through 1440 minutes and clamps legacy shorter settings', () => {
    for (const value of [5, 9, 0, 'garbage', 1441]) assert.equal(intervalMinutes(config(value)), 10);
    for (const value of [10, 30, 60, 120, 1440]) assert.equal(intervalMinutes(config(value)), value);
});

test('3000 staggered servers keep spacing, minimum intervals and bounded concurrency', async () => {
    const clock = new Clock(); const starts = []; let active = 0; let peak = 0;
    const ids = Array.from({ length: 3000 }, (_, i) => String(100000000000000000n + BigInt(i)));
    const sched = createScheduler({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, random: () => 0,
        loadEnabled: async () => ids, readConfig: async () => config(),
        drop: async (_client, id) => { active++; peak = Math.max(peak, active); starts.push({ at: clock.time, id }); await flush(); active--; },
    });
    await sched.start({});
    assert.equal(clock.timers.size, 3000);
    assert.ok(new Set([...clock.timers.values()].map((timer) => timer.at)).size > 2900);
    assert.ok(Math.min(...[...clock.timers.values()].map((timer) => timer.at)) >= 600000);
    await clock.advance(1260000);
    assert.equal(new Set(starts.map((start) => start.id)).size, 3000);
    const previous = new Map();
    for (const start of starts) {
        if (previous.has(start.id)) assert.ok(start.at - previous.get(start.id) >= 600000);
        previous.set(start.id, start.at);
    }
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i].at - starts[i - 1].at >= 200);
    assert.ok(peak <= 4); assert.ok(sched.queueStats().queued <= 1000);
    sched.stopAll(); assert.equal(clock.timers.size, 0);
});

test('an overloaded queue postpones servers, and shutdown cancels waiting drops', async () => {
    const clock = new Clock(); const block = deferred(); let calls = 0;
    const ids = Array.from({ length: 3000 }, (_, i) => String(100000000000000000n + BigInt(i)));
    const sched = createScheduler({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
        random: () => 0, spread: () => 0, loadEnabled: async () => ids, readConfig: async () => config(),
        drop: async () => { calls++; await block.promise; } });
    await sched.start({}); await clock.advance(601000);
    assert.equal(calls, 4); assert.equal(sched.queueStats().active, 4); assert.ok(sched.queueStats().queued <= 1000);
    sched.stopAll(); block.resolve(); await flush();
    assert.equal(sched.queueStats().queued, 0); assert.equal(clock.timers.size, 0); assert.equal(calls, 4);
});

test('disabled or changed schedules are not posted after a queued config read', async () => {
    const clock = new Clock(); const block = deferred(); let reads = 0; let calls = 0;
    const sched = createScheduler({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
        spread: () => 0, loadEnabled: async () => [GUILD], readConfig: async () => ++reads === 1 ? config() : block.promise,
        drop: async () => { calls++; } });
    await sched.start({}); await clock.advance(600000); sched.stop(GUILD);
    block.resolve(config()); await flush(); assert.equal(calls, 0); assert.equal(sched.size(), 0); sched.stopAll();
});

test('queue deduplicates jobs and recovers a worker after failure', async () => {
    const block = deferred(); const errors = []; let ran = 0;
    const queue = createWorkQueue({ concurrency: 1, spacingMs: 0, maxPending: 1, onError: (error) => errors.push(error) });
    assert.equal(queue.add('a', () => block.promise), true); assert.equal(queue.add('a', () => {}), false);
    assert.equal(queue.add('b', () => { ran++; throw Error('bad'); }), true);
    assert.equal(queue.add('c', () => {}), false); block.resolve(); await flush(); await flush();
    assert.equal(ran, 1); assert.equal(errors.length, 1); assert.deepEqual(queue.stats(), { active: 0, queued: 0 });
});

test('pool maintenance coalesces thousands of calls and enforces a cooldown', async () => {
    let now = 0; const upkeep = createMaintenance({ now: () => now }); const block = deferred(); let calls = 0;
    const jobs = Array.from({ length: 3000 }, () => upkeep.request(async () => { calls++; return block.promise; }));
    await flush(); assert.equal(calls, 1); block.resolve({ doc: 'shared' });
    assert.ok((await Promise.all(jobs)).every((result) => result.doc === 'shared'));
    assert.equal(upkeep.request(() => {}), null); now = 60000;
    await upkeep.request(async () => { calls++; }); assert.equal(calls, 2);
});

test('screenshots coalesce concurrent requests and cache empty results without treating outages as empties', async () => {
    const block = deferred(); let calls = 0; const cache = createCache({ max: 20, ttlMs: 86400000 });
    const options = { cache, limiter: { schedule: (run) => run() }, fetch: async () => { calls++; return block.promise; } };
    const jobs = Array.from({ length: 20 }, () => fetchScreenshots(99, options));
    block.resolve({ status: 200, json: async () => [] }); await Promise.all(jobs);
    await fetchScreenshots(99, { ...options, fresh: true }); assert.equal(calls, 1);
    const down = await fetchScreenshots(100, { ...options, fetch: async () => ({ status: 503 }) });
    assert.equal(down.down, true); assert.equal(cache.get('100'), undefined);
    await fetchScreenshots(101, { ...options, fetch: async () => ({ status: 404 }) }); assert.deepEqual(cache.get('101'), []);
});

test('leaderboard only resolves the visible page with three concurrent fetches and cached reuse', async () => {
    let calls = 0; let active = 0; let peak = 0;
    const client = { users: { cache: new Map(), fetch: async (id) => { calls++; active++; peak = Math.max(peak, active); await flush(); active--; return { username: `User${id}` }; } } };
    const entries = Array.from({ length: 50 }, (_, i) => ({ userID: String(i), position: i + 1, wins: 1 }));
    const first = await loadPageNames(client, entries, 0); assert.equal(calls, 10); assert.equal(peak, 3);
    assert.equal(first[0].username, 'User0'); assert.equal(first[10].username, undefined);
    await loadPageNames(client, first, 0); assert.equal(calls, 10);
    const actions = []; const state = { ownerId: USER, page: 0, entries: first,
        loadPage: async (rows, page) => { actions.push('load'); return loadPageNames(client, rows, page); } };
    const next = await onBoardClick({ user: { id: USER }, customId: NEXT_ID,
        async deferUpdate() { actions.push('defer'); }, async editReply() { actions.push('edit'); } }, state);
    assert.equal(next.page, 1); assert.equal(calls, 20); assert.deepEqual(actions, ['defer', 'load', 'edit']);
});

test('guess context only keeps relevant anime relations and is cached across requests', async () => {
    let calls = 0;
    const client = createClient({ fetch: async () => { calls++; return { status: 200, json: async () => ({ data: { Media: {
        format: 'MOVIE', relations: { edges: [
            { relationType: 'PREQUEL', node: { type: 'ANIME', title: { english: 'Series' } } },
            { relationType: 'CHARACTER', node: { type: 'ANIME', title: { english: 'Crossover' } } },
            { relationType: 'ADAPTATION', node: { type: 'MANGA', title: { english: 'Manga' } } },
        ] },
    } } }) }; }, limiter: { waitMs: () => 0, schedule: (run) => run() } });
    const [a, b] = await Promise.all([client.getGuessContext('1'), client.getGuessContext('1')]);
    assert.deepEqual(a.relatedTitles, ['Series']); assert.deepEqual(a, b);
    await client.getGuessContext('1'); assert.equal(calls, 1);
});

test('a schedule disabled while preparing a screenshot cannot post it', async () => {
    const { dropRound } = require('../src/guess/scheduler');
    let current = true; let sent = 0; const block = deferred();
    const channel = { id: CHANNEL, guild: { id: GUILD }, permissionsFor: () => ({ has: () => true }), send: async () => { sent++; } };
    const client = { user: { id: BOT }, options: { intents: { has: () => true } }, channels: { cache: new Map([[CHANNEL, channel]]) } };
    const pending = dropRound(client, GUILD, config(), { isCurrent: () => current, choose: () => block.promise });
    await flush(); current = false; block.resolve({ ok: true, media: movie, url: 'https://shikimori.io/test.jpg' });
    await assert.rejects(pending, /schedule changed/); assert.equal(sent, 0);
});

test('replay honors member and bot channel permissions before charging a play', async () => {
    let plays = 0; const client = { user: { id: BOT } };
    for (const denied of [USER, BOT]) {
        const interaction = replayInteraction();
        interaction.channel.permissionsFor = (id) => ({ has: () => id !== denied });
        await handleReplay(interaction, client, { play: async () => { plays++; } });
        assert.match(interaction.replies[0].content, /permission/);
    }
    assert.equal(plays, 0);
});

test('leaderboard expiry during a name fetch cannot re-enable its controls', async () => {
    const block = deferred(); const actions = [];
    const entries = Array.from({ length: 20 }, (_, i) => ({ userID: String(i), username: `User${i}`, position: i + 1, wins: 1 }));
    const state = { ownerId: USER, page: 0, entries, loadPage: () => block.promise };
    const pending = onBoardClick({ user: { id: USER }, customId: NEXT_ID, async deferUpdate() {},
        async editReply(payload) { actions.push(payload); } }, state);
    await flush(); state.closed = true; block.resolve(entries); await pending;
    assert.ok(actions[0].components[0].toJSON().components.every((button) => button.disabled));
});

test('a transient configuration read failure retries scheduling instead of losing the server', async () => {
    const clock = new Clock(); let reads = 0; let drops = 0;
    const scheduler = createScheduler({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
        loadEnabled: async () => [GUILD], spread: () => 0, random: () => 0,
        readConfig: async () => { if (++reads === 2) throw Error('temporary'); return config(30); },
        drop: async () => { drops++; } });
    await scheduler.start({});
    await assert.rejects(scheduler.syncGuild(GUILD), /temporary/);
    await clock.advance(60000);
    assert.equal(reads, 3); assert.equal(drops, 0);
    assert.equal([...clock.timers.values()][0].at, clock.time + 30 * 60000);
    scheduler.stopAll();
});

test('lazy leaderboard resolution still removes confirmed bot accounts', async () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({ userID: String(index), wins: 12 - index }));
    let calls = 0;
    const client = { users: { fetch: async (id) => { calls++; return { username: `User${id}`, bot: id === '0' }; } } };
    const rows = await loadPageNames(client, entries, 0);
    assert.equal(rows.length, 11); assert.equal(rows[0].userID, '1'); assert.equal(rows[0].position, 1);
    assert.equal(rows[9].username, 'User10'); assert.equal(calls, 11);
});
