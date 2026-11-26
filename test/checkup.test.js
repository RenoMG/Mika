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
const ProfileLink = require('../src/Models/ProfileLink');
const Config = require('../src/Models/ConfigurationDB');
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
test('stale profile-link editors fail visibly rather than replacing newer links', async () => {
    await ProfileLink.deleteMany({});
    await ProfileLink.create({ userId: TARGET, anilist: { id: '1', name: 'First' } });
    const [a, b] = await Promise.all([ProfileLink.findOne({ userId: TARGET }), ProfileLink.findOne({ userId: TARGET })]);
    a.mal = { name: 'Mine' }; await a.save(); b.mal = { name: 'Stale' };
    await assert.rejects(b.save(), { name: 'VersionError' });
    assert.equal((await ProfileLink.findOne({ userId: TARGET })).mal.name, 'Mine');
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

test('router acknowledges before a config lookup and keeps public commands public', async () => {
    const router = require('../src/events/interactionCreate');
    const findOne = Config.findOne;
    for (const commandName of ['search', 'profile']) {
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
function recordInteraction({ member = null, user = null, strings = {}, ints = {} } = {}) {
    const sent = [];
    return { sent, interaction: { guildId: GUILD, createdTimestamp: Date.now(),
        guild: { id: GUILD, ownerId: '100000000000000099', members: { me: { id: '100000000000000040', permissions: { has: () => true }, roles: { highest: { position: 10 } } } } },
        user: { id: SENDER }, member: { id: SENDER, roles: { highest: { position: 5 } } },
        options: { getMember: () => member, getUser: () => user || (member && member.user) || null,
            getString: (name) => strings[name] ?? null, getInteger: (name) => ints[name] ?? null },
        reply: async (body) => { sent.push(body); },
    } };
}
test('db:migrate folds WarnDB-only warnings into the single record and drops WarnDB', async () => {
    const Warn = require('../src/Models/WarnDB'); const Infra = require('../src/Models/InfractionsDB');
    await Warn.deleteMany({}); await Infra.deleteMany({});
    await Warn.create({ GuildID: GUILD, UserID: TARGET, Content: [{ warningId: 'b', Reason: 'B' }, { Reason: 'legacy', ExecuterID: SENDER, Date: '1/1/2020' }] });
    await Infra.create({ GuildID: GUILD, UserID: TARGET, Warns: [{ warningId: 'a', Reason: 'A' }, { warningId: 'b', Reason: 'B' }], Kicks: [{ Reason: 'old kick' }] });
    await Warn.create({ GuildID: GUILD, UserID: SENDER, Content: [{ warningId: 'z', Reason: 'only here' }] });
    await migrations.migrate();
    assert.equal(await Warn.countDocuments({}), 0);
    const target = await Infra.findOne({ UserID: TARGET });
    assert.deepEqual(target.Warns.map((entry) => entry.Reason), ['A', 'B', 'legacy']);
    assert.ok(target.Warns.every((entry) => entry.warningId));
    assert.ok(target.Kicks[0].warningId, 'older kicks get a stable id too');
    assert.deepEqual((await Infra.findOne({ UserID: SENDER })).Warns.map((entry) => entry.Reason), ['only here']);
    await migrations.migrate();
    assert.equal((await Infra.findOne({ UserID: TARGET })).Warns.length, 3, 'running it again changes nothing');
});
test('warn writes one record, and removeinfraction edits the record of someone who left', async () => {
    const Infra = require('../src/Models/InfractionsDB');
    await Infra.deleteMany({});
    const member = { id: TARGET, user: { id: TARGET, username: 'Target' }, roles: { highest: { position: 1 } }, displayAvatarURL: () => null };
    for (const reason of ['first', 'second']) {
        await require('../src/commands/moderation/warn').execute(recordInteraction({ member, strings: { reason } }).interaction);
    }
    assert.deepEqual((await Infra.findOne({ UserID: TARGET })).Warns.map((entry) => entry.Reason), ['first', 'second']);
    // They left: no member, only the user.
    const { interaction, sent } = recordInteraction({ user: { id: TARGET, username: 'Target' }, strings: { type: 'warn' }, ints: { id: 1 } });
    await require('../src/commands/moderation/removeinfraction').execute(interaction);
    assert.match(sent[0].embeds[0].data.description, /Removed warning \*\*#1\*\*/);
    assert.deepEqual((await Infra.findOne({ UserID: TARGET })).Warns.map((entry) => entry.Reason), ['second']);
});
test('removeinfraction refuses a member ranked at or above the moderator', async () => {
    const above = { id: TARGET, user: { id: TARGET }, roles: { highest: { position: 9 } } };
    const { interaction, sent } = recordInteraction({ member: above, strings: { type: 'kick' }, ints: { id: 1 } });
    await require('../src/commands/moderation/removeinfraction').execute(interaction);
    assert.match(sent[0].content, /at or above yours/);
});
test('clearinfractions can clear one type and keep the rest', async () => {
    const Infra = require('../src/Models/InfractionsDB');
    await Infra.deleteMany({});
    await Infra.create({ GuildID: GUILD, UserID: TARGET, Warns: [{ warningId: 'a' }, { warningId: 'b' }], Bans: [{ warningId: 'c' }] });
    const { interaction, sent } = recordInteraction({ user: { id: TARGET }, strings: { type: 'warn' } });
    await require('../src/commands/moderation/clearinfractions').execute(interaction);
    assert.match(sent[0].embeds[0].data.description, /Cleared all warnings/);
    const doc = await Infra.findOne({ UserID: TARGET });
    assert.equal(doc.Warns.length, 0); assert.equal(doc.Bans.length, 1);
    const all = recordInteraction({ user: { id: TARGET } });
    await require('../src/commands/moderation/clearinfractions').execute(all.interaction);
    assert.equal(await Infra.countDocuments({ UserID: TARGET }), 0);
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
test('the Warn app opens its form without deferring, and the form saves the warning', async () => {
    const Infra = require('../src/Models/InfractionsDB');
    const apps = require('../src/commands/moderation/apps');
    const interactionCreate = require('../src/events/interactionCreate');
    await Infra.deleteMany({});
    const member = { id: TARGET, displayName: 'Target', user: { id: TARGET, username: 'Target' }, roles: { highest: { position: 1 } }, displayAvatarURL: () => null };
    const { interaction: base } = recordInteraction({ member });
    const calls = [];
    const app = { ...base, commandName: 'Warn', channel: { id: '1' }, targetMember: member, targetUser: member.user,
        member: { ...base.member, permissions: { has: () => true } },
        guild: { ...base.guild, members: { ...base.guild.members, fetch: async () => member } },
        isChatInputCommand: () => false, isUserContextMenuCommand: () => true,
        deferReply: async () => calls.push('defer'), showModal: async (modal) => calls.push(modal.toJSON().custom_id) };
    const { Collection } = require('discord.js');
    await interactionCreate.execute(app, { commands: new Collection([['Warn', apps.warnApp]]) });
    assert.deepEqual(calls, [`${apps.WARN_MODAL_PREFIX}${TARGET}`]);

    const edits = [];
    const submit = { ...app, customId: calls[0], channelId: '1', deferred: false, replied: false,
        isModalSubmit: () => true, fields: { getTextInputValue: () => 'spamming' },
        async deferReply() { this.deferred = true; }, async editReply(body) { edits.push(body); } };
    await interactionCreate.execute(submit, {});
    assert.match(edits[0].embeds[0].data.description, /was warned/);
    assert.deepEqual((await Infra.findOne({ UserID: TARGET })).Warns.map((entry) => entry.Reason), ['spamming']);
});
test('a moderator can remove a record from the /infractions view', async () => {
    const Infra = require('../src/Models/InfractionsDB');
    const infractions = require('../src/commands/moderation/infractions');
    const menu = require('../src/commands/moderation/menu/infractionsMenu');
    await Infra.deleteMany({});
    await Infra.create({ GuildID: GUILD, UserID: TARGET, Warns: [{ warningId: 'a', Reason: 'A' }, { warningId: 'b', Reason: 'B' }] });
    const { interaction } = recordInteraction({ user: { id: TARGET, username: 'Target' } });
    let collect; const views = [];
    Object.assign(interaction, { deferred: true, ephemeral: true,
        editReply: async (body) => { views.push(body); return { createMessageComponentCollector: () => ({ on: (event, fn) => { if (event === 'collect') collect = fn; } }) }; } });
    await infractions.showInfractions(interaction, { id: TARGET, username: 'Target' }, null);
    const component = (customId, values) => ({ customId, values, user: { id: SENDER }, deferred: false, replied: false,
        async deferUpdate() { this.deferred = true; }, async editReply(body) { views.push(body); }, async update(body) { views.push(body); } });
    await collect(component(menu.SELECT_ID, ['warns']));
    const rows = views.at(-1).components.map((row) => row.toJSON().components[0]);
    assert.ok(rows.some((row) => row.custom_id === menu.REMOVE_ID));
    await collect(component(menu.REMOVE_ID, ['0']));
    assert.match(views.at(-1).embeds[0].data.description, /Removed warning \*\*#1\*\*/);
    assert.deepEqual((await Infra.findOne({ UserID: TARGET })).Warns.map((entry) => entry.Reason), ['B']);
});
test('your own record is read-only in /infractions', () => {
    const menu = require('../src/commands/moderation/menu/infractionsMenu');
    const doc = { Warns: [{ Reason: 'A' }] };
    const view = menu.buildInfractionsView({ user: { id: TARGET }, doc, selected: 'warns' });
    assert.ok(!view.components.some((row) => row.toJSON().components[0].custom_id === menu.REMOVE_ID));
});
