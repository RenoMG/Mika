const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MessageFlags } = require('discord.js');
const { crystalMultiplier, crystalReward } = require('../src/guess/rewards');
const { handleHint, hintRow, hintData } = require('../src/guess/hints');
const { createRegistry, startRound } = require('../src/guess/round');
const { createLocks } = require('../src/guess/lock');

const USER = '323456789012345678';
const OTHER = '223456789012345679';
const GUILD = '123456789012345678';
const CHANNEL = '423456789012345678';
const PROMPT = '523456789012345678';
const BOT = '623456789012345678';
const SHOT = 'https://shikimori.io/a.jpg';
const EXTRA = 'https://shikimori.io/b.jpg';
const media = { id: '1', titles: { english: 'Cowboy Bebop' }, genres: ['Action', 'Sci-Fi'], studios: ['Sunrise'] };
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

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

function setup(t, overrides = {}, hooks = {}) {
    const events = {}; const reveals = []; const awards = []; const edits = [];
    const registry = createRegistry(); t.after(() => registry.clear());
    const prompt = { id: PROMPT, author: { id: BOT }, edit: async (body) => { edits.push(body); } };
    const channel = { createMessageCollector: () => ({ on: (key, fn) => { events[key] = fn; }, stop() {} }) };
    const round = registry.watch(channel, { manual: true, userId: USER, guildId: GUILD, channelId: CHANNEL,
        promptId: PROMPT, promptMessage: prompt, media, url: SHOT, screenshots: [SHOT, EXTRA], ...overrides }, {
        award: async (...args) => awards.push(args), announce: async (body) => reveals.push(body), ...hooks,
    });
    function click(kind = 'genre', user = USER) {
        const replies = []; const acks = [];
        return { customId: `guess:hint:${kind}`, user: { id: user }, guild: { id: GUILD }, channelId: CHANNEL,
            message: prompt, replies, acks,
            async deferReply(body) { acks.push(body); },
            async reply(body) { replies.push(body); }, async editReply(body) { replies.push(body); },
        };
    }
    const win = () => events.collect({ id: 'guess', channelId: CHANNEL, author: { id: USER, username: 'Reno' }, content: 'Cowboy Bebop' });
    return { registry, round, click, events, reveals, awards, edits, win, client: { user: { id: BOT } } };
}

test('weekends follow Pacific midnight in winter, summer, and both DST transitions', () => {
    const cases = [
        ['2026-11-27T07:59:59.999Z', 1], ['2026-11-27T08:00:00Z', 2],
        ['2026-11-30T07:59:59.999Z', 2], ['2026-11-30T08:00:00Z', 1],
        ['2026-07-03T06:59:59.999Z', 1], ['2026-07-03T07:00:00Z', 2],
        ['2026-07-06T06:59:59.999Z', 2], ['2026-07-06T07:00:00Z', 1],
        ['2026-03-08T09:59:59Z', 2], ['2026-03-08T10:00:00Z', 2],
        ['2026-03-09T07:00:00Z', 1], ['2026-11-01T08:59:59Z', 2],
        ['2026-11-01T09:00:00Z', 2], ['2026-11-02T08:00:00Z', 1],
    ];
    for (const [time, expected] of cases) {
        assert.equal(crystalMultiplier(true, Date.parse(time)), expected, time);
        assert.equal(crystalMultiplier(false, Date.parse(time)), 1, time);
    }
    for (const multiplier of [1, 2]) {
        const rewards = Array.from({ length: 4 }, (_, count) => crystalReward({ crystalMultiplier: multiplier,
            purchasedHints: new Set(['genre', 'studio', 'screenshot'].slice(0, count)) }));
        assert.deepEqual(rewards, multiplier === 1 ? [50, 37, 25, 12] : [100, 75, 50, 25]);
    }
});

test('startRound attaches hint controls and freezes the advertised weekend bonus only for personal rounds', async () => {
    for (const manual of [true, false]) {
        let payload; let attached;
        const locks = createLocks();
        const result = await startRound({ manual, now: Date.parse('2026-11-27T08:00:00Z'), channelId: CHANNEL,
            guildId: GUILD, userId: USER, locks,
            peekAndConsume: async () => ({ allowed: true, remaining: 0 }),
            choose: async () => ({ ok: true, media, url: SHOT, screenshots: [SHOT, EXTRA] }),
            send: async (body) => { payload = body; return { id: PROMPT }; }, attach: (round) => { attached = round; },
        });
        assert.equal(result.crystalMultiplier, manual ? 2 : 1);
        assert.equal(attached.crystalMultiplier, result.crystalMultiplier);
        assert.equal(payload.embeds[0].data.description.includes('weekend ×2'), manual);
        assert.match(payload.embeds[0].data.description, /\*\*30 seconds\*\*/);
        assert.ok(payload.embeds[0].data.description.includes('\n\n'));
        if (manual) {
            assert.match(payload.embeds[0].data.description, /\*\*10 seconds\*\*/);
            assert.equal(payload.components[0].toJSON().components.length, 3);
            assert.ok(payload.components[0].toJSON().components.every((button) => !button.disabled));
            assert.ok(payload.embeds[0].data.footer.text.endsWith('Last round this hour'));
        } else assert.equal(payload.components, undefined);
        locks.release(result.lockKey);
    }
});

test('three private hints charge once each, show a different image, and reduce the actual weekend award', async (t) => {
    const f = setup(t, { crystalMultiplier: 2, remaining: 0 }); const charges = [];
    const deps = { registry: f.registry, spend: async (...args) => { charges.push(args); return true; } };
    for (const kind of ['genre', 'studio', 'screenshot']) {
        const interaction = f.click(kind);
        await handleHint(interaction, f.client, deps);
        assert.equal(interaction.acks[0].flags, MessageFlags.Ephemeral);
        const hint = interaction.replies[0].embeds[0].data;
        if (kind === 'genre') assert.equal(hint.description, 'Action, Sci-Fi');
        if (kind === 'studio') assert.equal(hint.description, 'Sunrise');
        if (kind === 'screenshot') assert.equal(hint.image.url, EXTRA);
        assert.ok(f.edits.at(-1).components[0].toJSON().components.find((b) => b.custom_id.endsWith(kind)).disabled);
    }
    assert.deepEqual(charges.map((args) => args[2]), [10, 20, 25]);
    await handleHint(f.click(), f.client, deps);
    assert.equal(charges.length, 3);
    await f.win();
    assert.deepEqual(f.awards, [[USER, GUILD, 25]]);
    assert.match(f.reveals[0].content, /\*\*\+25\*\* 💎/);
    assert.ok(f.reveals[0].embeds[0].data.fields.some((field) => field.name === '💎 Weekend bonus'));
    assert.deepEqual(f.reveals[0].components, []);
    assert.ok(f.edits.at(-1).components[0].toJSON().components.every((b) => b.disabled));
});

test('other players, stale prompts, wrong guilds, auto rounds, unavailable hints and poor players are not charged', async (t) => {
    const f = setup(t); let charges = 0;
    const deps = { registry: f.registry, spend: async () => { charges++; return false; } };
    for (const mutate of [
        (i) => { i.user.id = OTHER; }, (i) => { i.message = { ...i.message, id: 'old' }; },
        (i) => { i.guild.id = OTHER; }, (i) => { i.message = { ...i.message, author: { id: OTHER } }; },
        (i) => { i.customId = 'guess:hint:unknown'; },
    ]) {
        const i = f.click(); mutate(i); await handleHint(i, f.client, deps);
        assert.equal(i.replies[0].flags, MessageFlags.Ephemeral);
    }
    f.round.manual = false; await handleHint(f.click(), f.client, deps); f.round.manual = true;
    f.round.screenshots = [SHOT, SHOT];
    await handleHint(f.click('screenshot'), f.client, deps);
    assert.equal(hintData(f.round, 'screenshot'), '');
    assert.equal(charges, 0);
    const poor = f.click(); await handleHint(poor, f.client, deps);
    assert.match(poor.replies[0].content, /need \*\*10\*\*/);
    assert.equal(f.round.purchasedHints.size, 0);
    assert.equal(charges, 1);
    assert.ok(hintRow({ media: {}, screenshots: [] }).toJSON().components.every((b) => b.disabled));
});

test('double clicks cannot double charge and a timeout during debit refunds the purchase', async (t) => {
    const f = setup(t); const block = deferred(); let charges = 0; let refunds = 0;
    const deps = { registry: f.registry, spend: async () => { charges++; return block.promise; }, refund: async () => { refunds++; } };
    const first = handleHint(f.click(), f.client, deps); await flush();
    const second = f.click(); await handleHint(second, f.client, deps);
    assert.match(second.replies[0].content, /still loading/);
    const ending = f.events.end([], 'time');
    block.resolve(true); await Promise.all([first, ending]);
    assert.equal(charges, 1); assert.equal(refunds, 1); assert.equal(f.round.purchasedHints.size, 0);
    await handleHint(f.click(), f.client, deps); assert.equal(charges, 1);
    assert.equal(f.reveals.length, 1);
});

test('a win during private hint delivery waits and uses the reduced reward', async (t) => {
    const f = setup(t); const block = deferred(); const i = f.click(); let delivering = false;
    i.editReply = async () => { delivering = true; await block.promise; };
    const pending = handleHint(i, f.client, { registry: f.registry, spend: async () => true });
    await flush(); assert.equal(delivering, true);
    const winning = f.win(); await flush(); assert.equal(f.awards.length, 0);
    block.resolve(); await Promise.all([pending, winning]);
    assert.deepEqual(f.awards, [[USER, GUILD, 37]]);
    assert.ok(f.edits.at(-1).components[0].toJSON().components.every((b) => b.disabled));
});

test('failed hint delivery refunds crystals and leaves the full reward intact', async (t) => {
    const f = setup(t); let refunds = 0; const i = f.click();
    i.editReply = async () => { throw Error('deleted interaction'); };
    await assert.rejects(handleHint(i, f.client, { registry: f.registry, spend: async () => true,
        refund: async (_user, _guild, cost) => { refunds += cost; } }), /deleted interaction/);
    assert.equal(refunds, 10); assert.equal(f.round.purchasedHints.size, 0);
    await f.win(); assert.deepEqual(f.awards, [[USER, GUILD, 50]]);
});

test('a hint at 15 seconds adds ten to the remaining time and ignores old timeout and safety callbacks', async (t) => {
    const clock = new Clock(); const locks = createLocks();
    const f = setup(t, {}, { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, locks });
    locks.acquire(f.round.lockKey);
    const oldCallbacks = [...clock.timers.values()].map((timer) => timer.fn);
    await clock.advance(15000);
    const i = f.click('screenshot');
    await handleHint(i, f.client, { registry: f.registry, spend: async () => true });
    assert.equal(f.round.deadlineAt - clock.now(), 25000);
    assert.match(i.replies[0].embeds[0].data.footer.text, /\+10s/);
    for (const fn of oldCallbacks) fn();
    await clock.advance(20000);
    assert.equal(f.round.done, false); assert.equal(locks.held(f.round.lockKey), true);
    await f.win();
    assert.deepEqual(f.awards, [[USER, GUILD, 37]]);
    assert.equal(clock.timers.size, 0); assert.equal(locks.held(f.round.lockKey), false);
    await clock.advance(30000); assert.equal(f.reveals.length, 1);
});

test('three hints accumulate to sixty seconds, while repeated and rejected clicks add no time', async (t) => {
    const clock = new Clock();
    const f = setup(t, {}, { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    const deps = { registry: f.registry, spend: async () => true };
    await handleHint(f.click(), f.client, { ...deps, spend: async () => false });
    await handleHint(f.click('genre', OTHER), f.client, deps);
    assert.equal(f.round.deadlineAt, 30000);
    for (const [index, kind] of ['genre', 'studio', 'screenshot'].entries()) {
        await clock.advance(15000);
        await handleHint(f.click(kind), f.client, deps);
        await handleHint(f.click(kind), f.client, deps);
        assert.equal(f.round.deadlineAt, 40000 + index * 10000);
        assert.equal(clock.timers.size, 2);
    }
    await clock.advance(14999); assert.equal(f.round.done, false);
    await clock.advance(1); assert.equal(f.round.done, true);
    assert.equal(f.reveals.length, 1); assert.equal(f.awards.length, 0); assert.equal(clock.timers.size, 0);
});

test('an unpaid pending hint cannot extend an expired round', async (t) => {
    const clock = new Clock(); const block = deferred(); let refunds = 0;
    const f = setup(t, {}, { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    await clock.advance(29000);
    const pending = handleHint(f.click(), f.client, { registry: f.registry, spend: () => block.promise,
        refund: async () => { refunds++; } });
    await flush(); await clock.advance(1000);
    block.resolve(true); await pending; await flush();
    assert.equal(f.round.deadlineAt, 30000); assert.equal(f.round.done, true);
    assert.equal(refunds, 1); assert.equal(f.round.purchasedHints.size, 0); assert.equal(f.reveals.length, 1);
});

test('delivery can finish after the original deadline, but failed delivery rolls extra time back', async (t) => {
    for (const succeeds of [true, false]) {
        const clock = new Clock(); const block = deferred(); let refunds = 0;
        const f = setup(t, {}, { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
        await clock.advance(29000);
        const i = f.click();
        i.editReply = async () => { await block.promise; if (!succeeds) throw Error('delivery failed'); };
        const pending = handleHint(i, f.client, { registry: f.registry, spend: async () => true,
            refund: async () => { refunds++; } });
        const result = succeeds ? pending : assert.rejects(pending, /delivery failed/);
        await flush(); await clock.advance(6000);
        assert.equal(f.round.done, false); assert.equal(f.round.deadlineAt, 40000);
        block.resolve(); await result; await clock.advance(0);
        assert.equal(f.round.deadlineAt, succeeds ? 40000 : 30000);
        assert.equal(refunds, succeeds ? 0 : 1);
        assert.equal(f.round.done, !succeeds);
        if (succeeds) { await f.win(); assert.deepEqual(f.awards, [[USER, GUILD, 37]]); }
        else assert.equal(f.reveals.length, 1);
    }
});

test('automatic rounds still end at thirty seconds and cannot reserve hint time', async (t) => {
    const clock = new Clock();
    const f = setup(t, { manual: false }, { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    assert.equal(f.round.reserveHintTime(), null);
    await clock.advance(30000);
    assert.equal(f.round.done, true); assert.equal(f.reveals.length, 1);
});
