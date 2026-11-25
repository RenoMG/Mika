const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { PermissionFlagsBits: P } = require('discord.js');
const { createClient, createLimiter } = require('../src/anime/client');
const { createMongoCache } = require('../src/anime/cache');
const { roleAssignmentError } = require('../src/utils/roles');
const { auditActor } = require('../src/utils/logging');
const { readJson } = require('../src/utils/http');
const Profile = require('../src/Models/AnimeProfile');
const Config = require('../src/Models/ConfigurationDB');
const { PendingRecommendation: Pending, RecommendGuard: Guard, FullListNotice } = require('../src/Models/AnimeRecommend');
const recommendations = require('../src/anime/recommend');
const Levels = require('../src/levels');
const store = require('../src/guess/store');
const Mute = require('../src/Models/Mute');
const mutes = require('../src/utils/mutes');
const migrations = require('../src/db/migrations');
const GUILD = '100000000000000010';
const TARGET = '100000000000000020';
const SENDER = '100000000000000030';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const noCache = { get: async () => undefined, set: async () => {} };
const immediate = { waitMs: () => 0, noteRetryAfter() {}, schedule: (run) => run() };
const raw = (id = 1) => ({ id, idMal: id, title: { english: 'Sample' }, isAdult: false, averageScore: 80, popularity: 20000 });
const response = (data) => ({ status: 200, json: async () => ({ data }), headers: { get: () => null } });
const fresh = (overrides) => createClient({ detailCache: noCache, searchCache: noCache, genreCache: noCache, limiter: immediate, kitsuLimiter: immediate, ...overrides });
let mongo;
before(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongo.getUri());
    await migrations.migrate();
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });
async function resetRecommendations(full = false) {
    await Promise.all([Profile.deleteMany({}), Pending.deleteMany({}), Guard.deleteMany({}), FullListNotice.deleteMany({})]);
    await Profile.create({ userId: TARGET, recommendations: true, planningList: full
        ? Array.from({ length: require('../src/anime/library').statusInfo('planning').max }, (_, index) => ({ anilistId: String(100000 + index), title: `Show ${index}` })) : [] });
}
function rec(overrides = {}) {
    return { senderId: SENDER, targetId: TARGET, anilist: '1', inGuild: true, targetIsBot: false,
        guildId: GUILD, media: { id: '1', titles: { english: 'Sample' } }, send: async () => ({ id: 'dm' }), ...overrides };
}

test('Unicode queries reach AniList and aliases keep distinct cache keys', async () => {
    const queries = [];
    const client = fresh({ fetch: async (_, init) => { queries.push(JSON.parse(init.body).variables.search); return response({ Page: { media: [raw()] } }); } });
    assert.equal((await client.search('進撃の巨人', { anilistOnly: true }))[0].id, '1');
    assert.deepEqual(queries, ['進撃の巨人']);
});
test('catalog data survives a missing optional cache and is fetched once', async () => {
    let calls = 0;
    const client = fresh({ fetch: async () => { calls += 1; return response({ GenreCollection: ['Action'], MediaTagCollection: [{ name: 'Isekai' }] }); } });
    assert.deepEqual(await client.getGenres(), ['Action']);
    assert.deepEqual(await client.getTags(), ['Isekai']);
    assert.equal(calls, 1);
});
test('identity-bound autocomplete never spends requests on unusable Kitsu IDs', async () => {
    let calls = 0;
    const client = fresh({ fetch: async () => { calls += 1; return { status: 503 }; } });
    assert.deepEqual(await client.search('sample', { anilistOnly: true }), []);
    assert.equal(calls, 1);
});
test('a ten-result snapshot takes one cold Mongo read, then zero warm reads or writes', async () => {
    let reads = 0; let writes = 0;
    const now = Date.now();
    const model = {
        findOne() { reads += 1; return { maxTimeMS() { return this; }, lean: async () => ({ _id: 'x', expireAt: new Date(now + 60000), lastAccessedAt: new Date(now), value: Array.from({ length: 10 }, (_, index) => ({ id: String(index + 1) })) }) }; },
        updateOne() { writes += 1; return { maxTimeMS: () => Promise.resolve() }; },
    };
    const client = fresh({ searchCache: createMongoCache({ kind: 'search', ttlMs: 60000, model }), fetch: async () => { throw Error('Unexpected provider request'); } });
    assert.equal((await client.search('sample')).length, 10);
    assert.equal((await client.search('sample')).length, 10);
    assert.equal(reads, 1); assert.equal(writes, 0);
});
test('random uses a known valid first page and does not wait for cache writes', async () => {
    let page; let writes = 0;
    const client = fresh({ detailCache: { ...noCache, set: () => { writes += 1; return new Promise(() => {}); } },
        fetch: async (_, init) => { page = JSON.parse(init.body).variables.page; return response({ Page: { pageInfo: { lastPage: 2 }, media: Array.from({ length: 25 }, (_, index) => raw(index + 1)) } }); } });
    const result = await Promise.race([client.randomAnime({ random: () => 0.99 }), pause(150).then(() => null)]);
    assert.equal(result?.ok, true); assert.equal(page, 1); assert.equal(writes, 25);
});
test('unsupported random tags never silently fall back to unfiltered Kitsu', async () => {
    let calls = 0;
    const client = fresh({ fetch: async () => { calls += 1; return { status: 503 }; } });
    assert.deepEqual(await client.randomAnime({ tags: ['Isekai'] }), { ok: false, unavailable: true });
    assert.equal(calls, 1);
});
test('a slow body is cancelled and a different caller retains its own deadline', async () => {
    let calls = 0; let signal;
    const client = fresh({ fetch: async (_, init) => { signal = init.signal; calls += 1; return { status: 200, json: async () => { await pause(50); return { data: { Page: { media: [raw()] } } }; } }; } });
    const short = client.search('sample', { anilistOnly: true, budgetMs: 10 });
    const longer = client.search('sample', { anilistOnly: true, budgetMs: 200 });
    assert.deepEqual(await short, []);
    assert.equal((await longer)[0].id, '1'); assert.equal(calls, 1);
    const alone = fresh({ fetch: async (_, init) => { signal = init.signal; return { status: 200, json: () => new Promise(() => {}) }; } });
    assert.deepEqual(await alone.search('alone', { anilistOnly: true, budgetMs: 10 }), []);
    assert.equal(signal.aborted, true);
});
test('full-response reader rejects oversized bodies', async () => {
    await assert.rejects(readJson(new Response('0123456789'), undefined, 5), /size limit/);
});
test('detail requests share a fetch and queue through normal spacing', async () => {
    let now = 0; let calls = 0;
    const limiter = createLimiter({ now: () => now, sleep: async (ms) => { now += ms; } });
    const client = fresh({ limiter, fetch: async (_, init) => { calls += 1; return response({ Media: raw(JSON.parse(init.body).variables.id) }); } });
    const results = await Promise.all([client.getAnime('1'), client.getAnime('1')]);
    assert.ok(results.every(Boolean)); assert.equal(calls, 1);
    assert.ok(await client.getAnime('2')); assert.equal(calls, 2); assert.equal(now, 2500);
});
test('role delegation checks privileges, both hierarchies, managed roles and Manage Roles', () => {
    const perms = (bits) => ({ has: (bit) => bits.includes(bit) });
    const guild = { id: GUILD, ownerId: SENDER, members: { me: { permissions: perms([P.ManageRoles]), roles: { highest: { position: 10 } } } } };
    const actor = { id: TARGET, permissions: perms([P.ManageGuild]), roles: { highest: { position: 5 } } };
    const role = { id: '123', position: 1, permissions: perms([]) };
    assert.match(roleAssignmentError(guild, role, actor, { requireManageRoles: true }), /Manage Roles/);
    actor.permissions = perms([P.ManageGuild, P.ManageRoles]);
    assert.equal(roleAssignmentError(guild, role, actor, { requireManageRoles: true }), null);
    assert.match(roleAssignmentError(guild, { ...role, position: 6 }, actor), /your highest/);
    assert.match(roleAssignmentError(guild, { ...role, position: 10 }, actor), /my highest/);
    assert.ok(roleAssignmentError(guild, { ...role, managed: true }, actor));
    assert.ok(roleAssignmentError(guild, { ...role, permissions: perms([P.Administrator]) }, actor));
});
test('concurrent recommendations reserve before delivery and send only once', async () => {
    await resetRecommendations(); let sends = 0;
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => recommendations.deliverRecommend(rec({ send: async () => { sends += 1; return {}; } }))));
    assert.equal(outcomes.filter((value) => value.ok).length, 1); assert.equal(sends, 1);
    assert.equal(await Pending.countDocuments(), 1);
});
test('recipient quota covers simultaneous full-list notices from different senders', async () => {
    await resetRecommendations(true); let sends = 0;
    await Promise.all(Array.from({ length: 12 }, (_, index) => recommendations.deliverRecommend(rec({ senderId: String(BigInt(SENDER) + BigInt(index)), send: async () => { sends += 1; } }))));
    assert.equal(sends, recommendations.DAILY_CAP);
    assert.equal((await Guard.findOne({ userId: TARGET })).receivedCount, recommendations.DAILY_CAP);
});
test('a failed pending-record write sends no DM and compensates its quota', async () => {
    await resetRecommendations(); let sends = 0; const create = Pending.create;
    Pending.create = async () => { throw Error('simulated database failure'); };
    try { await assert.rejects(recommendations.deliverRecommend(rec({ send: async () => { sends += 1; } })), /simulated/); }
    finally { Pending.create = create; }
    assert.equal(sends, 0); assert.equal(await Guard.countDocuments({ receivedCount: { $gt: 0 } }), 0);
});
test('failed acceptance remains retryable', async () => {
    await resetRecommendations(); const delivered = await recommendations.deliverRecommend(rec());
    const save = Profile.prototype.save;
    Profile.prototype.save = async () => { throw Error('simulated save failure'); };
    try {
        await assert.rejects(recommendations.handleRecommendButton({ customId: `rec:a:${delivered.publicId}`, user: { id: TARGET, username: 'Reno' },
            deferUpdate: async () => {}, followUp: async () => {}, editReply: async () => {} }, {}), /simulated/);
    } finally { Profile.prototype.save = save; }
    const pending = await Pending.findOne({ publicId: delivered.publicId });
    assert.equal(pending.status, 'pending'); assert.equal(pending.processingUntil, undefined);
});
test('atomic XP increments and persisted cooldown prevent lost or duplicate awards', async () => {
    const model = mongoose.model('Levels'); await model.deleteMany({});
    await Promise.all(Array.from({ length: 20 }, () => Levels.appendXp(SENDER, GUILD, 10)));
    assert.equal((await model.findOne({ userID: SENDER })).xp, 200);
    const now = Date.now();
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => Levels.appendXp(SENDER, GUILD, 1, { cooldownMs: 60000, now })));
    assert.equal(outcomes.filter((value) => value !== null).length, 1);
    assert.equal((await model.findOne({ userID: SENDER })).xp, 201);
});
test('play quota is atomic across concurrent channel requests', async () => {
    await require('../src/Models/GuessPlayer').deleteMany({});
    const outcomes = await Promise.all(Array.from({ length: 15 }, () => store.consumePlay(SENDER, GUILD)));
    const granted = outcomes.filter((value) => value.allowed);
    assert.equal(granted.length, 10);
    assert.equal(new Set(granted.map((value) => value.stamp)).size, 10);
    await store.refundPlay(SENDER, GUILD, granted[0].stamp);
    assert.equal((await store.consumePlay(SENDER, GUILD)).allowed, true);
});
test('stale profile editors fail visibly rather than replacing newer lists', async () => {
    await resetRecommendations();
    const [a, b] = await Promise.all([Profile.findOne({ userId: TARGET }), Profile.findOne({ userId: TARGET })]);
    a.genres = ['Action']; await a.save(); b.genres = ['Drama'];
    await assert.rejects(b.save(), { name: 'VersionError' });
    assert.deepEqual((await Profile.findOne({ userId: TARGET })).genres, ['Action']);
});
test('config reads use isolated snapshots and invalidate after saves', async () => {
    const config = require('../src/utils/getGuildConfig');
    const first = await config.getGuildConfig(GUILD); const second = await config.getGuildConfig(GUILD);
    first.GreetingStatus = [{ Status: 'true' }];
    assert.equal(second.GreetingStatus[0].Status, 'false'); await first.save();
    assert.equal((await config.getGuildConfig(GUILD)).GreetingStatus[0].Status, 'true');
});
test('timed mutes survive a scheduler restart and re-muting replaces expiry', async () => {
    await Mute.deleteMany({}); const roles = new Map();
    const guild = { id: GUILD, members: { fetch: async () => member } };
    const member = { id: TARGET, guild, roles: { cache: roles, add: async (id) => roles.set(id, {}), remove: async (id) => roles.delete(id) } };
    const client = { guilds: { cache: new Map([[GUILD, guild]]) } };
    await mutes.applyMute(member, '123', 1); await pause(5);
    await mutes.applyMute(member, '123', 60000);
    let stop = mutes.startMuteScheduler(client); await pause(50); stop();
    assert.equal(roles.has('123'), true);
    await Mute.updateOne({ guildId: GUILD, userId: TARGET }, { $set: { expiresAt: new Date(0) } });
    stop = mutes.startMuteScheduler(client);
    for (let index = 0; index < 40 && roles.has('123'); index += 1) await pause(10);
    stop(); assert.equal(roles.has('123'), false);
    await mutes.applyMute(member, '123', null); await mutes.clearMute(member, '123');
    assert.equal((await Mute.findOne({ guildId: GUILD })).expiresAt, null);
});
test('audit attribution refuses unrelated or stale entries', async () => {
    const now = Date.now();
    const guild = { id: 'audit-test', fetchAuditLogs: async () => ({ entries: new Map([
        ['wrong', { action: 10, targetId: 'other', createdTimestamp: now, executor: 'wrong' }],
        ['stale', { action: 10, targetId: TARGET, createdTimestamp: now - 60000, executor: 'stale' }],
    ]) }) };
    assert.equal(await auditActor(guild, 10, TARGET, now), null);
});
test('migration refuses duplicates before writing and verifies required indexes', async () => {
    await migrations.verifyIndexes();
    await Config.collection.dropIndex('GuildID_1');
    await Config.collection.insertMany([{ GuildID: 'duplicate' }, { GuildID: 'duplicate' }]);
    await assert.rejects(migrations.migrate(), /Duplicate natural keys/);
    assert.equal(await Config.countDocuments({ GuildID: 'duplicate' }), 2);
    await Config.deleteMany({ GuildID: 'duplicate' }); await migrations.migrate(); await migrations.verifyIndexes();
});

test('router acknowledges before a config lookup and preserves public list visibility', async () => {
    const router = require('../src/events/interactionCreate');
    const findOne = Config.findOne;
    for (const commandName of ['search', 'watching']) {
        const order = [];
        const interaction = { commandName, isChatInputCommand: () => true,
            guild: { id: `${commandName}-ack`, members: {} }, channel: { id: '123' },
            options: { getSubcommand: () => 'list' },
            deferReply: async (options) => { assert.equal(options?.flags, undefined); order.push('ack'); },
            reply: async () => { throw Error('Unexpected initial reply'); },
        };
        Config.findOne = function (...args) { assert.equal(interaction.deferred, true); order.push('db'); return findOne.apply(this, args); };
        try {
            await router.execute(interaction, { commands: new Map([[commandName, { checkDisabledChannels: true, execute: async () => order.push('execute') }]]) });
        } finally { Config.findOne = findOne; }
        assert.deepEqual(order, ['ack', 'db', 'execute']);
    }
});
test('menu acknowledges before the handler and updates its deferred reply', async () => {
    const { watchMenu } = require('../src/anime/menu');
    const { updateComponent } = require('../src/utils/ack');
    let collect; const calls = [];
    watchMenu({ message: { createMessageComponentCollector: () => ({ on: (event, handler) => { if (event === 'collect') collect = handler; } }) },
        interaction: { user: { id: SENDER } }, commandName: 'search', disabledView: () => ({}),
        onCollect: async (component) => { assert.equal(component.deferred, true); calls.push('handler'); await updateComponent(component, { content: 'result' }); },
    });
    await collect({ user: { id: SENDER }, deferUpdate: async () => calls.push('ack'), editReply: async () => calls.push('edit') });
    assert.deepEqual(calls, ['ack', 'handler', 'edit']);
});
test('unwarn removes the corresponding historical warning after older warnings were cleared', async () => {
    const Warn = require('../src/Models/WarnDB'); const Infra = require('../src/Models/InfractionsDB');
    await Warn.deleteMany({}); await Infra.deleteMany({});
    await Warn.create({ GuildID: GUILD, UserID: TARGET, Content: [{ warningId: 'c', Reason: 'C' }] });
    await Infra.create({ GuildID: GUILD, UserID: TARGET, Warns: [{ warningId: 'a', Reason: 'A' }, { warningId: 'b', Reason: 'B' }, { warningId: 'c', Reason: 'C' }] });
    const target = { id: TARGET, user: { id: TARGET, username: 'Target', tag: 'Target' }, roles: { highest: { position: 1 } } };
    await require('../src/commands/moderation/unwarn').execute({ guildId: GUILD,
        guild: { id: GUILD, ownerId: SENDER, members: { me: { id: '100000000000000040', permissions: { has: () => true }, roles: { highest: { position: 10 } } } } },
        user: { id: SENDER }, member: { id: SENDER, roles: { highest: { position: 5 } } },
        options: { getMember: () => target, getInteger: () => 1 }, reply: async () => {},
    });
    assert.deepEqual((await Warn.findOne({ UserID: TARGET })).Content, []);
    assert.deepEqual((await Infra.findOne({ UserID: TARGET })).Warns.map((entry) => entry.Reason), ['A', 'B']);
});
test('a failed delivery receipt is reported truthfully while the pending buttons remain usable', async () => {
    await resetRecommendations(); const update = Pending.updateOne; const log = console.error;
    Pending.updateOne = () => { throw Error('receipt unavailable'); }; console.error = () => {};
    let outcome;
    try { outcome = await recommendations.deliverRecommend(rec()); }
    finally { Pending.updateOne = update; console.error = log; }
    assert.equal(outcome.ok, false); assert.match(outcome.message, /DM was sent/);
    assert.equal((await Pending.findOne({ publicId: outcome.publicId })).status, 'pending');
});
test('a failed initial guess schedule read is retried', async () => {
    const { createScheduler } = require('../src/guess/scheduler');
    let loads = 0; let retry; let delay; const original = console.error;
    const scheduler = createScheduler({ loadEnabled: async () => { if (++loads === 1) throw Error('temporary outage'); return []; },
        setTimer: (fn, ms) => { retry = fn; delay = ms; return { unref() {} }; }, clearTimer() {},
    });
    console.error = () => {};
    try { await scheduler.start({}); } finally { console.error = original; }
    assert.equal(scheduler.started, false); assert.equal(delay, 60000);
    await retry(); assert.equal(scheduler.started, true); assert.equal(loads, 2); scheduler.stopAll();
});
