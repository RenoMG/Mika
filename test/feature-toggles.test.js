const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const OWNER = '100000000000000041';
const GUILD = '300000000000000041';
const CHANNEL = '123456789012345641';
const GONE = '123456789012345642';

let mongoose;
let mongod;
let ConfigurationDB;
let Mute;
let panel;
let interactionCreate;
let mutes;

before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoose = require('mongoose');
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongod.getUri(), { dbName: 'mika' });
    ConfigurationDB = require('../src/Models/ConfigurationDB');
    Mute = require('../src/Models/Mute');
    panel = require('../src/commands/configuration/hub/hub');
    interactionCreate = require('../src/events/interactionCreate');
    mutes = require('../src/utils/mutes');
}, { timeout: 180000 });

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

async function saveConfig(guildId, values) {
    const { getGuildConfig, invalidateGuildConfig } = require('../src/utils/getGuildConfig');
    const doc = await getGuildConfig(guildId, { fresh: true });
    for (const [key, value] of Object.entries(values)) {
        doc[key] = value;
        doc.markModified(key);
    }
    await doc.save();
    invalidateGuildConfig(guildId);
}

function component(overrides = {}) {
    const replies = [];
    const updates = [];
    return {
        customId: overrides.customId,
        values: overrides.values || [],
        user: { id: OWNER },
        guild: { id: overrides.guildId || GUILD, channels: { cache: new Map(overrides.channels || []) } },
        member: { permissions: { has: () => true } },
        replied: false,
        deferred: false,
        replies,
        updates,
        isButton: () => overrides.button === true,
        isStringSelectMenu: () => overrides.button !== true,
        async reply(body) { replies.push(body); this.replied = true; },
        async followUp(body) { replies.push(body); },
        async update(body) { updates.push(body); },
        async deferUpdate() { this.deferred = true; },
        async editReply(body) { updates.push(body); },
    };
}

test('every feature area has a category toggle, and the new ones default to on', () => {
    const byName = Object.fromEntries(['search', 'randomanime', 'profile', 'findprofile', 'link']
        .map((name) => [name, require(`../src/commands/anime/${name}`)]));
    for (const [name, command] of Object.entries(byName)) assert.equal(command.configKey, 'AnimeCommandStatus', name);
    assert.equal(require('../src/commands/guess/guess').configKey, 'GuessCommandStatus');
    assert.equal(require('../src/commands/anime/meme').configKey, 'MemeCommandStatus');

    const fresh = new ConfigurationDB({ GuildID: 'defaults' });
    assert.equal(fresh.AnimeCommandStatus[0].Status, 'true');
    assert.equal(fresh.GuessCommandStatus[0].Status, 'true');

    const { sectionOf } = require('../src/commands/configuration/hub/sections');
    const toggles = sectionOf('features').controls.filter((control) => control.kind === 'toggle').map((control) => control.key);
    assert.deepEqual(toggles, ['ModerationCommandStatus', 'AnimeCommandStatus', 'MemeCommandStatus', 'GuessCommandStatus', 'InfoCommandStatus', 'LevelingCommandStatus']);
});

test('a guild saved before a toggle existed still shows and runs that feature as on', () => {
    const { sectionEmbed } = require('../src/commands/configuration/hub/sections');
    const embed = sectionEmbed('features', { ModerationCommandStatus: [{ Status: 'true' }] });
    const value = (name) => embed.data.fields.find((field) => field.name === name).value;
    assert.equal(value('Anime lookups'), '🟢 On');
    assert.equal(value('Guess That Anime'), '🟢 On');
    const { guessEnabled, guessGameEnabled } = require('../src/guess/settings');
    assert.equal(guessGameEnabled({}), true);
    assert.equal(guessEnabled({ GuessStatus: [{ Status: 'true' }] }), true);
    assert.equal(guessEnabled({ GuessStatus: [{ Status: 'true' }], GuessCommandStatus: [{ Status: 'false' }] }), false);
});

test('turning the guess game off also stops its buttons', async () => {
    const guildId = '300000000000000043';
    await saveConfig(guildId, { GuessCommandStatus: [{ Status: 'false' }] });
    const button = component({ customId: 'guess:shop:shield', guildId, button: true });
    await interactionCreate.execute(button, { user: { id: 'bot' } });
    assert.equal(button.replies.length, 1);
    assert.match(button.replies[0].content, /turned this command off/);
    assert.equal(button.replies[0].flags & MessageFlags.Ephemeral, MessageFlags.Ephemeral);
});

test('restricted channels are one list; saving it drops deleted channels', async () => {
    const guildId = '300000000000000044';
    await saveConfig(guildId, { DisabledChannels: [{ Channels: CHANNEL }, { Channels: GONE }] });

    // The picker shows the stored channels that still exist as already picked.
    const open = component({ customId: `cfg:nav:-:-:${OWNER}`, guildId, values: ['restricted'], channels: [[CHANNEL, { name: 'general' }]] });
    await panel.handleConfigComponent(open);
    const menu = open.updates[0].components[0].toJSON().components[0];
    assert.equal(menu.type, 8);
    assert.equal(menu.max_values, 25);
    assert.equal(menu.min_values, 0);
    assert.deepEqual(menu.default_values, [{ id: CHANNEL, type: 'channel' }]);
    assert.match(open.updates[0].embeds[0].data.footer.text, /1 deleted channel is dropped on the next save/);

    // Saving replaces the whole list, without duplicates.
    await panel.handleConfigComponent(component({ customId: `cfg:channels:restricted:list:${OWNER}`, guildId, values: [CHANNEL, CHANNEL, '123456789012345643'] }));
    let saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.deepEqual(saved.DisabledChannels.map((entry) => entry.Channels), [CHANNEL, '123456789012345643']);

    // Clearing every pick clears the list.
    await panel.handleConfigComponent(component({ customId: `cfg:channels:restricted:list:${OWNER}`, guildId, values: [] }));
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.deepEqual(saved.DisabledChannels, []);
});

test('a config save that races another admin is retried, not lost', async () => {
    const guildId = '300000000000000045';
    await saveConfig(guildId, { LoggingStatus: [{ Status: 'false' }] });
    // Another admin saves between our read and our write.
    const original = ConfigurationDB.prototype.save;
    let raced = false;
    ConfigurationDB.prototype.save = async function save(...args) {
        if (!raced && this.GuildID === guildId) {
            raced = true;
            await ConfigurationDB.updateOne({ GuildID: guildId }, { $set: { MemeCommandStatus: [{ Status: 'false' }] }, $inc: { __v: 1 } });
        }
        return original.apply(this, args);
    };
    try {
        await panel.handleConfigComponent(component({ customId: `cfg:on:logging:status:${OWNER}`, guildId, button: true }));
    } finally {
        ConfigurationDB.prototype.save = original;
    }
    const saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.LoggingStatus[0].Status, 'true');
    assert.equal(saved.MemeCommandStatus[0].Status, 'false');
});

test('/config is hidden from members and refused at runtime without Manage Server', async () => {
    const config = require('../src/commands/configuration/config');
    assert.equal(config.data.toJSON().default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
    assert.deepEqual(config.data.toJSON().contexts, [0]);
    let ran = false;
    const replies = [];
    await interactionCreate.execute({
        isChatInputCommand: () => true,
        commandName: 'config',
        guild: { id: GUILD, members: { me: { permissions: { has: () => true } } } },
        channel: { id: CHANNEL },
        member: { permissions: { has: (bit) => bit !== PermissionFlagsBits.ManageGuild && !(Array.isArray(bit) && bit.includes(PermissionFlagsBits.ManageGuild)) } },
        options: { getSubcommand: () => 'info' },
        reply: async (body) => replies.push(body),
    }, { commands: { get: () => ({ ...config, execute: async () => { ran = true; } }) } });
    assert.equal(ran, false);
    assert.match(replies[0].content, /permission/);

    // A copied panel button does nothing for someone without Manage Server.
    const button = component({ customId: `cfg:on:logging:status:${OWNER}`, button: true });
    button.member = { permissions: { has: () => false } };
    await panel.handleConfigComponent(button);
    assert.equal(button.replies[0].content, panel.NEED_MANAGE);
});

test('/help marks features that are off in this server', () => {
    const helpMenu = require('../src/commands/help/menu/helpMenu');
    const commands = ['search', 'meme'].map((name) => require(`../src/commands/anime/${name}`));
    const [anime] = helpMenu.groupCommands(commands, { AnimeCommandStatus: [{ Status: 'false' }] });
    const blocks = anime.commands.flatMap((command) => helpMenu.blocksForCommand(command));
    assert.ok(blocks.find((block) => block.startsWith('**/search')).includes(helpMenu.OFF_NOTE));
    assert.equal(blocks.find((block) => block.startsWith('**/meme')).includes(helpMenu.OFF_NOTE), false);
    const [allOff] = helpMenu.groupCommands(commands, { AnimeCommandStatus: [{ Status: 'false' }], MemeCommandStatus: [{ Status: 'false' }] });
    assert.match(allOff.blurb, /^🔴 Off in this server/);
});

test('/clear starts below its own placeholder and never deletes it', async () => {
    const clear = require('../src/commands/moderation/clear');
    const reply = { id: '900' };
    let fetchedWith = null;
    let deleted = null;
    const older = ['899', '898', '897'].map((id) => ({ id, author: { id: 'someone' } }));
    const finished = [];
    const interaction = {
        id: 'interaction-1',
        user: { id: OWNER },
        guild: { members: { me: { permissions: { has: () => true } } } },
        options: { getInteger: () => 2, getMember: () => null },
        channel: {
            messages: { fetch: async (options) => { fetchedWith = options; return new Map(older.map((m) => [m.id, m])); } },
            bulkDelete: async (list) => { deleted = list.map((m) => m.id); return new Map(list.map((m) => [m.id, m])); },
        },
        deferred: false,
        replied: false,
        async deferReply() { this.deferred = true; },
        async fetchReply() { return reply; },
        async editReply(body) { finished.push(body); },
    };
    await clear.execute(interaction);
    assert.deepEqual(fetchedWith, { limit: 100, before: '900' });
    assert.deepEqual(deleted, ['899', '898']);
    assert.match(finished[0].embeds[0].data.description, /Cleared \*\*2 messages\*\*/);
});

test('/ban works on a user who is not in the server', async () => {
    const ban = require('../src/commands/moderation/ban');
    const mod = require('../src/utils/moderation');
    const created = [];
    const target = { id: '500000000000000001', displayAvatarURL: () => 'https://cdn.example/a.png' };
    const finished = [];
    const interaction = {
        user: { id: OWNER },
        guildId: GUILD,
        createdTimestamp: Date.now(),
        guild: {
            id: GUILD,
            ownerId: 'owner',
            members: { me: { id: 'bot', permissions: { has: () => true } } },
            bans: { create: async (id, options) => created.push({ id, options }) },
            channels: { cache: new Map() },
        },
        options: {
            getMember: () => null,
            getUser: () => target,
            getString: (name) => (name === 'reason' ? 'raid account' : '0'),
        },
        deferred: false,
        replied: false,
        async deferReply() { this.deferred = true; },
        async editReply(body) { finished.push(body); },
    };
    assert.equal(ban.precheck(interaction), null);
    const originalPush = mod.pushInfraction;
    mod.pushInfraction = async () => { throw new Error('db down'); };
    try {
        await ban.execute(interaction);
    } finally {
        mod.pushInfraction = originalPush;
    }
    assert.deepEqual(created, [{ id: target.id, options: { deleteMessageSeconds: 0, reason: 'raid account' } }]);
    // The ban happened, so the reply says so, with a note about the failed record.
    const text = finished[0].embeds[0].data.description;
    assert.match(text, /was banned/);
    assert.match(text, /couldn't save it/);
});

test('mutes survive a rejoin, and an absent member no longer blocks expiry', async () => {
    const guild = { id: '300000000000000046' };
    const role = { id: '600000000000000001', position: 1, managed: false };
    guild.roles = { cache: new Map([[role.id, role]]) };
    guild.members = { me: { roles: { highest: { position: 10 } } } };
    const added = [];
    const member = { id: '700000000000000001', guild, roles: { add: async (ids) => added.push(...ids) } };
    await Mute.create({ guildId: guild.id, userId: member.id, roleIds: [role.id], expiresAt: new Date(Date.now() + 60_000) });
    assert.deepEqual(await mutes.restoreMute(member), [role.id]);
    assert.deepEqual(added, [role.id]);

    // Expired while away: the record is closed instead of failing every tick.
    await Mute.create({ guildId: guild.id, userId: '700000000000000002', roleIds: [role.id], expiresAt: new Date(Date.now() - 1000) });
    const client = {
        guilds: {
            cache: new Map([[guild.id, {
                members: { fetch: async () => { const error = new Error('Unknown Member'); error.code = 10007; throw error; } },
            }]]),
        },
    };
    const stop = mutes.startMuteScheduler(client);
    try {
        for (let i = 0; i < 50; i += 1) {
            const doc = await Mute.findOne({ userId: '700000000000000002' }).lean();
            if (doc.expiresAt === null) break;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    } finally {
        stop();
    }
    const closed = await Mute.findOne({ userId: '700000000000000002' }).lean();
    assert.equal(closed.expiresAt, null);
    assert.deepEqual(closed.roleIds, []);
});

test('display names are escaped in welcome text but not on rank cards', () => {
    const { memberValues } = require('../src/utils/formatMessage');
    const values = memberValues({ displayName: '**bold**', user: { id: '1' } });
    assert.equal(values.userd, '\\*\\*bold\\*\\*');
    const { intervalText } = require('../src/commands/configuration/hub/sections');
    assert.equal(intervalText(1440), '24 hours');
    assert.equal(intervalText(61), '1 hour 1 minute');
});
