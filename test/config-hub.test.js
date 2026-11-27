const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { ChannelType, MessageFlags, PermissionFlagsBits, PermissionsBitField } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const OWNER = '100000000000000051';
const OTHER = '100000000000000052';
const CHANNEL = '123456789012345651';
const ROLE = '223456789012345651';

let mongoose;
let mongod;
let ConfigurationDB;
let hub;
let sections;
let config;
let interactionCreate;
let guildCounter = 0;

before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoose = require('mongoose');
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongod.getUri(), { dbName: 'mika' });
    ConfigurationDB = require('../src/Models/ConfigurationDB');
    hub = require('../src/commands/configuration/hub/hub');
    sections = require('../src/commands/configuration/hub/sections');
    config = require('../src/commands/configuration/config');
    interactionCreate = require('../src/events/interactionCreate');
}, { timeout: 180000 });

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

function newGuild() {
    guildCounter += 1;
    return `40000000000000${String(guildCounter).padStart(4, '0')}`;
}

function permissions(...allowed) {
    return { has: (bit) => (Array.isArray(bit) ? bit : [bit]).every((entry) => allowed.includes(entry)) };
}

const MANAGER = { id: OWNER, permissions: permissions(PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles), roles: { highest: { position: 20 } } };

// A component or modal click on the hub.
function click(customId, { guildId, values, channels, roles, member = MANAGER, userId = OWNER, fields, guild = {} } = {}) {
    const replies = [];
    const updates = [];
    const modals = [];
    return {
        customId,
        values: values || [],
        user: { id: userId },
        member,
        guild: {
            id: guildId,
            ownerId: 'owner',
            channels: { cache: new Map((channels || []).map((entry) => [entry.id, entry])) },
            roles: { cache: new Map() },
            members: { me: { id: 'bot', permissions: permissions(PermissionFlagsBits.ManageRoles), roles: { highest: { position: 50 } } } },
            ...guild,
        },
        channels: new Map((channels || []).map((entry) => [entry.id, entry])),
        roles: new Map((roles || []).map((entry) => [entry.id, entry])),
        fields,
        replied: false,
        deferred: false,
        replies,
        updates,
        modals,
        async reply(body) { replies.push(body); this.replied = true; },
        async followUp(body) { replies.push(body); },
        async deferUpdate() { this.deferred = true; },
        async editReply(body) { updates.push(body); },
        async update(body) { updates.push(body); },
        async showModal(modal) { modals.push(modal); },
    };
}

function components(view) {
    return view.components.flatMap((row) => row.toJSON().components);
}

function field(view, name) {
    const found = view.embeds[0].data.fields.find((entry) => entry.name === name);
    assert.ok(found, name);
    return found.value;
}

async function stored(guildId) {
    return ConfigurationDB.findOne({ GuildID: guildId }).lean();
}

function textChannel(id = CHANNEL, { type = ChannelType.GuildText, canPost = true } = {}) {
    return {
        id,
        type,
        permissionsFor: () => ({ has: () => canPost }),
    };
}

function role(id, { position = 5, perms = 0n, managed = false } = {}) {
    return {
        id,
        position,
        managed,
        permissions: new PermissionsBitField(perms),
        comparePositionTo: (other) => position - other.position,
    };
}

test('/config is one server-only command for Manage Server, with an optional section jump', () => {
    const json = config.data.toJSON();
    assert.equal(json.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
    assert.deepEqual(json.contexts, [0]);
    assert.equal(json.options.length, 1);
    assert.equal(json.options[0].name, 'section');
    assert.equal(json.options[0].required, false);
    assert.deepEqual(json.options[0].choices.map((choice) => choice.value), sections.SECTIONS.map((section) => section.id));
    assert.deepEqual(config.permissions, [PermissionFlagsBits.ManageGuild]);
    assert.deepEqual(config.botPermissions, []);
    assert.equal(config.replies, 'private');
});

test('the home screen sums up every section and offers each one', () => {
    const data = new ConfigurationDB({ GuildID: 'home' }).toObject();
    const view = hub.homeView(data, OWNER);
    const lines = view.embeds[0].data.description.split('\n');
    for (const section of sections.SECTIONS) {
        assert.ok(lines.some((line) => line.startsWith(`${section.emoji} **${section.label}** — `)), section.id);
    }
    const [menu] = components(view);
    assert.equal(menu.custom_id, `cfg:nav:-:-:${OWNER}`);
    assert.deepEqual(menu.options.map((option) => option.value), sections.SECTIONS.map((section) => section.id));
    assert.equal(view.embeds[0].data.footer.text, 'Mika · ⚙️ Config');
});

test('every section fits Discord limits and every control routes back to itself', () => {
    const data = new ConfigurationDB({ GuildID: 'limits' }).toObject();
    for (const section of sections.SECTIONS) {
        const view = hub.sectionView(data, section.id, OWNER);
        assert.ok(view.components.length <= 5, `${section.id} rows`);
        for (const row of view.components) assert.ok(row.toJSON().components.length <= 5, `${section.id} row size`);
        const ids = components(view).map((entry) => entry.custom_id);
        assert.ok(ids.includes(`cfg:home:-:-:${OWNER}`), `${section.id} has a way back`);
        for (const id of ids) {
            assert.ok(id.length <= 100, id);
            assert.ok(hub.parseId(id), id);
        }
        // Every control in the list shows up in the section.
        for (const control of section.controls) {
            assert.ok(ids.some((id) => id.split(':')[2] === section.id && id.split(':')[3] === control.id), `${section.id}.${control.id}`);
        }
    }
});

test('a setting shown in two sections is one stored value', async () => {
    const guildId = newGuild();
    // Leveling: on from its own section, then off from Features.
    await hub.handleConfigComponent(click(`cfg:on:leveling:status:${OWNER}`, { guildId }));
    assert.equal((await stored(guildId)).LevelingCommandStatus[0].Status, 'true');
    const fromFeatures = click(`cfg:off:features:leveling:${OWNER}`, { guildId });
    await hub.handleConfigComponent(fromFeatures);
    assert.equal((await stored(guildId)).LevelingCommandStatus[0].Status, 'false');
    const leveling = hub.sectionView(await stored(guildId), 'leveling', OWNER);
    assert.ok(components(leveling).some((entry) => entry.label === 'Leveling: Off'));

    // Guess That Anime: off from the guess section reads off under Features.
    await hub.handleConfigComponent(click(`cfg:off:guess:game:${OWNER}`, { guildId }));
    const features = hub.sectionView(await stored(guildId), 'features', OWNER);
    assert.ok(components(features).some((entry) => entry.label === 'Guess That Anime: Off'));
});

test('a toggle button shows the current state and one press switches it', async () => {
    const guildId = newGuild();
    const view = hub.sectionView(new ConfigurationDB({ GuildID: guildId }).toObject(), 'welcome', OWNER);
    const greeting = components(view).find((entry) => entry.label && entry.label.startsWith('Greeting:'));
    assert.equal(greeting.label, 'Greeting: Off');
    assert.equal(greeting.custom_id, `cfg:on:welcome:greeting:${OWNER}`);

    const press = click(greeting.custom_id, { guildId });
    await hub.handleConfigComponent(press);
    assert.equal((await stored(guildId)).GreetingStatus[0].Status, 'true');
    const after = components(press.updates[0]).find((entry) => entry.label && entry.label.startsWith('Greeting:'));
    assert.equal(after.label, 'Greeting: On');
    assert.equal(after.custom_id, `cfg:off:welcome:greeting:${OWNER}`);
    // Pressing a stale "turn on" again keeps it on instead of flipping it back.
    await hub.handleConfigComponent(click(greeting.custom_id, { guildId }));
    assert.equal((await stored(guildId)).GreetingStatus[0].Status, 'true');
});

test('channel settings can be set, checked, and cleared', async () => {
    const guildId = newGuild();
    const set = click(`cfg:channel:leveling:channel:${OWNER}`, { guildId, values: [CHANNEL], channels: [textChannel()] });
    await hub.handleConfigComponent(set);
    assert.equal((await stored(guildId)).Levelupchannel[0].Channel, CHANNEL);
    assert.equal(field(set.updates[0], 'Level-up channel'), `<#${CHANNEL}>`);
    const menu = components(set.updates[0]).find((entry) => entry.custom_id === `cfg:channel:leveling:channel:${OWNER}`);
    assert.deepEqual(menu.default_values, [{ id: CHANNEL, type: 'channel' }]);
    assert.equal(menu.min_values, 0);

    // Clearing goes back to "same channel as the message", which used to be impossible.
    const clear = click(`cfg:channel:leveling:channel:${OWNER}`, { guildId, values: [] });
    await hub.handleConfigComponent(clear);
    assert.equal((await stored(guildId)).Levelupchannel[0].Channel, '');
    assert.equal(field(clear.updates[0], 'Level-up channel'), 'Same channel as the message');

    const voice = click(`cfg:channel:logging:channel:${OWNER}`, { guildId, values: [CHANNEL], channels: [textChannel(CHANNEL, { type: ChannelType.GuildVoice })] });
    await hub.handleConfigComponent(voice);
    assert.equal(voice.replies[0].content, hub.PICK_TEXT_CHANNEL);
    assert.equal(voice.updates.length, 1, 'the view is redrawn with the stored value');

    const blind = click(`cfg:channel:logging:channel:${OWNER}`, { guildId, values: [CHANNEL], channels: [textChannel(CHANNEL, { canPost: false })] });
    await hub.handleConfigComponent(blind);
    assert.match(blind.replies[0].content, /I can't post in/);
    assert.equal((await stored(guildId)).LoggingChannel[0].Channel, '');
});

test('roles are checked, and can be cleared', async () => {
    const guildId = newGuild();
    const ok = role(ROLE);
    const set = click(`cfg:role:roles:muterole:${OWNER}`, { guildId, values: [ROLE], roles: [ok] });
    await hub.handleConfigComponent(set);
    assert.equal((await stored(guildId)).Muterole[0].Role, ROLE);
    assert.match(field(set.updates[0], 'Mute role'), new RegExp(ROLE));

    const admin = click(`cfg:role:roles:autorole:${OWNER}`, { guildId, values: [ROLE], roles: [role(ROLE, { perms: PermissionFlagsBits.Administrator })] });
    await hub.handleConfigComponent(admin);
    assert.match(admin.replies[0].content, /must not grant moderation/);

    const noManageRoles = click(`cfg:role:roles:autorole:${OWNER}`, {
        guildId,
        values: [ROLE],
        roles: [ok],
        member: { ...MANAGER, permissions: permissions(PermissionFlagsBits.ManageGuild) },
    });
    await hub.handleConfigComponent(noManageRoles);
    assert.match(noManageRoles.replies[0].content, /Manage Roles/);

    await hub.handleConfigComponent(click(`cfg:role:roles:muterole:${OWNER}`, { guildId, values: [] }));
    assert.equal((await stored(guildId)).Muterole[0].Role, '');
});

test('messages open a prefilled text box, save, refuse blank or long text, and reset', async () => {
    const guildId = newGuild();
    const edit = click(`cfg:edit:welcome:gmessage:${OWNER}`, { guildId });
    await hub.handleConfigComponent(edit);
    const modal = edit.modals[0].toJSON();
    assert.equal(modal.custom_id, `cfg:modal:welcome:gmessage:${OWNER}`);
    assert.equal(modal.components[0].components[0].value, 'Welcome to the server {userd}!');
    assert.equal(edit.replies.length, 0);

    const submit = (text) => click(`cfg:modal:welcome:gmessage:${OWNER}`, { guildId, fields: { getTextInputValue: () => text } });
    const saved = submit('Hi {user}!');
    await hub.handleConfigModal(saved);
    assert.equal((await stored(guildId)).GreetingMessage[0].Message, 'Hi {user}!');
    assert.equal(field(saved.updates[0], 'Greeting message'), 'Hi {user}!');
    const reset = components(saved.updates[0]).find((entry) => entry.custom_id === `cfg:reset:welcome:gmessage:${OWNER}`);
    assert.equal(reset.disabled, false);

    const blank = submit('   ');
    await hub.handleConfigModal(blank);
    assert.equal(blank.replies[0].content, hub.EMPTY_TEXT);
    const long = submit('x'.repeat(sections.TEXT_MAX + 1));
    await hub.handleConfigModal(long);
    assert.equal(long.replies[0].content, hub.TOO_LONG);
    assert.equal((await stored(guildId)).GreetingMessage[0].Message, 'Hi {user}!');

    const press = click(`cfg:reset:welcome:gmessage:${OWNER}`, { guildId });
    await hub.handleConfigComponent(press);
    assert.equal((await stored(guildId)).GreetingMessage[0].Message, 'Welcome to the server {userd}!');
    const after = components(press.updates[0]).find((entry) => entry.custom_id === `cfg:reset:welcome:gmessage:${OWNER}`);
    assert.equal(after.disabled, true);

    // The level-up message resets to blank, which means the built-in text.
    await hub.handleConfigModal(click(`cfg:modal:leveling:message:${OWNER}`, { guildId, fields: { getTextInputValue: () => 'GG {user}' } }));
    await hub.handleConfigComponent(click(`cfg:reset:leveling:message:${OWNER}`, { guildId }));
    assert.equal((await stored(guildId)).Levelupmessage[0].Message, '');
});

test('only the opener with Manage Server can use the menu, and old menus are refused', async () => {
    const guildId = newGuild();
    const stranger = click(`cfg:on:logging:status:${OWNER}`, { guildId, userId: OTHER });
    await hub.handleConfigComponent(stranger);
    assert.equal(stranger.replies[0].content, hub.ONLY_OWNER);
    assert.equal(stranger.replies[0].flags & MessageFlags.Ephemeral, MessageFlags.Ephemeral);

    const demoted = click(`cfg:on:logging:status:${OWNER}`, { guildId, member: { permissions: permissions() } });
    await hub.handleConfigComponent(demoted);
    assert.equal(demoted.replies[0].content, hub.NEED_MANAGE);
    assert.equal(await stored(guildId), null);

    // Controls from the old per-subcommand panels, and forged ones, do nothing.
    for (const id of [
        `cfg:menu:welcome:-:${OWNER}`,
        `cfg:channel:commands:addchannel:${OWNER}`,
        `cfg:on:welcome:gchannel:${OWNER}`,
        `cfg:nav:welcome:-:${OWNER}`,
        'cfg:on:logging:status:not-a-user',
    ]) {
        const stale = click(id, { guildId });
        await hub.handleConfigComponent(stale);
        assert.equal(stale.replies[0].content, hub.STALE, id);
    }
    assert.equal(await stored(guildId), null);
});

test('/config opens home, or one section, privately', async () => {
    const guildId = newGuild();
    const open = (section, member = MANAGER) => {
        const sent = [];
        const interaction = {
            user: { id: OWNER },
            guild: { id: guildId, channels: { cache: new Map() } },
            member,
            deferred: false,
            replied: false,
            options: { getString: () => section },
            async deferReply(body) { this.deferred = true; sent.push({ deferred: body }); },
            async editReply(body) { sent.push(body); },
            async reply(body) { sent.push(body); },
            async followUp(body) { sent.push(body); },
            async deleteReply() {},
        };
        return { interaction, sent };
    };
    const home = open(null);
    await config.execute(home.interaction);
    assert.equal(home.sent[0].deferred.flags, MessageFlags.Ephemeral);
    assert.equal(home.sent[1].embeds[0].data.title, '⚙️ Server settings');

    const roles = open('roles');
    await config.execute(roles.interaction);
    assert.equal(roles.sent[1].embeds[0].data.title, '🎭 Roles');

    const member = open(null, { permissions: permissions() });
    await config.execute(member.interaction);
    assert.equal(member.sent[0].content, hub.NEED_MANAGE);
});

test('interactionCreate sends every hub control and modal to the hub', async () => {
    const guildId = newGuild();
    const kinds = ['isButton', 'isStringSelectMenu', 'isChannelSelectMenu', 'isRoleSelectMenu'];
    for (const kind of kinds) {
        const interaction = click(`cfg:nav:-:-:${OWNER}`, { guildId, values: ['logging'] });
        for (const name of [...kinds, 'isModalSubmit', 'isAutocomplete']) interaction[name] = () => name === kind;
        interaction.isChatInputCommand = () => false;
        await interactionCreate.execute(interaction, { commands: new Map() });
        assert.equal(interaction.updates[0].embeds[0].data.title, '📑 Logging', kind);
    }
    const modal = click(`cfg:modal:welcome:fmessage:${OWNER}`, { guildId, fields: { getTextInputValue: () => 'Bye {userd}' } });
    for (const name of [...kinds, 'isAutocomplete']) modal[name] = () => false;
    modal.isModalSubmit = () => true;
    await interactionCreate.execute(modal, { commands: new Map() });
    assert.equal((await stored(guildId)).FarewellMessage[0].Message, 'Bye {userd}');
});

test('an expired interaction is not logged as an error', async () => {
    const guildId = newGuild();
    const expired = click(`cfg:nav:-:-:${OWNER}`, { guildId, values: ['welcome'] });
    expired.deferUpdate = async () => {
        const error = new Error('Unknown interaction');
        error.code = 10062;
        throw error;
    };
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args);
    try {
        await hub.handleConfigComponent(expired);
    } finally {
        console.error = original;
    }
    assert.deepEqual(logged, []);
});

test('Features lists what each switch covers, read from the commands themselves', () => {
    const { SECTIONS, commandsFor, sectionEmbed } = sections;
    const embed = sectionEmbed('features', {});
    const value = (name) => embed.data.fields.find((entry) => entry.name.endsWith(` ${name}`)).value;
    assert.equal(value('Info & utility'), '`/about` `/pfp` `/ping` `/serverstats` `/status` `/whois`');
    assert.match(value('Moderation'), /`\/ban`.*`\/warn`/);
    assert.match(value('Logging'), /log channel/);
    assert.doesNotMatch(value('Logging'), /Commands:/);
    assert.match(value('Leveling'), /Chat XP.*`\/leaderboard` `\/level`/);

    // Every command with a category switch is listed under exactly one switch in Features.
    const features = SECTIONS.find((section) => section.id === 'features');
    const listed = features.controls.flatMap((control) => commandsFor(control.key));
    assert.equal(new Set(listed).size, listed.length);
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..', 'src', 'commands');
    for (const folder of fs.readdirSync(root)) {
        for (const file of fs.readdirSync(path.join(root, folder)).filter((name) => name.endsWith('.js'))) {
            const command = require(path.join(root, folder, file));
            if (command.configKey) assert.ok(listed.includes(command.data.name), command.data.name);
        }
    }
});

test('Logging can be switched from Features or from its own section', async () => {
    const guildId = newGuild();
    await hub.handleConfigComponent(click(`cfg:on:features:logging:${OWNER}`, { guildId }));
    assert.equal((await stored(guildId)).LoggingStatus[0].Status, 'true');
    const logging = hub.sectionView(await stored(guildId), 'logging', OWNER);
    assert.ok(components(logging).some((entry) => entry.label === 'Logging: On'));
    await hub.handleConfigComponent(click(`cfg:off:logging:status:${OWNER}`, { guildId }));
    const features = hub.sectionView(await stored(guildId), 'features', OWNER);
    assert.ok(components(features).some((entry) => entry.label === 'Logging: Off'));
});

test('Blog Watcher: switch, channel, ping role, message, feed, and a private preview', async () => {
    const guildId = newGuild();
    const open = click(`cfg:nav:-:-:${OWNER}`, { guildId, values: ['blog'] });
    await hub.handleConfigComponent(open);
    const view = open.updates[0];
    assert.equal(view.embeds[0].data.title, '📰 Blog Watcher');
    assert.equal(field(view, 'Blog feed'), '*Default:* https://renos.world/feed/');
    assert.equal(field(view, 'Ping role'), 'No ping');
    const ids = components(view).map((entry) => entry.custom_id);
    for (const id of ['on:blog:status', 'preview:blog:preview', 'channel:blog:channel', 'role:blog:role', 'edit:blog:message', 'edit:blog:feed']) {
        assert.ok(ids.includes(`cfg:${id}:${OWNER}`), id);
    }

    await hub.handleConfigComponent(click(`cfg:on:blog:status:${OWNER}`, { guildId }));
    await hub.handleConfigComponent(click(`cfg:channel:blog:channel:${OWNER}`, { guildId, values: [CHANNEL], channels: [textChannel()] }));
    let doc = await stored(guildId);
    assert.equal(doc.BlogStatus[0].Status, 'true');
    assert.equal(doc.BlogChannel[0].Channel, CHANNEL);
    assert.match(sections.homeEmbed(doc).data.description, new RegExp(`Blog Watcher\\*\\* — 🟢 New posts in <#${CHANNEL}>`));

    // The ping role is only mentioned, so hierarchy does not matter, but @everyone is refused.
    const everyone = click(`cfg:role:blog:role:${OWNER}`, { guildId, values: [guildId.padEnd(17, '0')] });
    everyone.guild.id = everyone.values[0];
    await hub.handleConfigComponent(everyone);
    assert.equal(everyone.replies[0].content, hub.PICK_PING_ROLE);
    await hub.handleConfigComponent(click(`cfg:role:blog:role:${OWNER}`, { guildId, values: [ROLE], roles: [role(ROLE, { position: 99 })] }));
    assert.equal((await stored(guildId)).BlogRole[0].Role, ROLE);

    // The feed box is one line, checks the address, and stores the feed that was found.
    const edit = click(`cfg:edit:blog:feed:${OWNER}`, { guildId });
    await hub.handleConfigComponent(edit);
    assert.equal(edit.modals[0].toJSON().components[0].components[0].style, 1);
    const original = hub.VALIDATORS.feed;
    hub.VALIDATORS.feed = async (raw) => (raw === 'bad.example'
        ? { error: 'That feed didn\'t work. Nope.' }
        : { value: `https://${raw}/feed/` });
    try {
        const bad = click(`cfg:modal:blog:feed:${OWNER}`, { guildId, fields: { getTextInputValue: () => 'bad.example' } });
        await hub.handleConfigModal(bad);
        assert.equal(bad.replies[0].content, 'That feed didn\'t work. Nope.');
        await hub.handleConfigModal(click(`cfg:modal:blog:feed:${OWNER}`, { guildId, fields: { getTextInputValue: () => 'blog.example.com' } }));
        assert.equal((await stored(guildId)).BlogFeed[0].URL, 'https://blog.example.com/feed/');
    } finally {
        hub.VALIDATORS.feed = original;
    }
    await hub.handleConfigComponent(click(`cfg:reset:blog:feed:${OWNER}`, { guildId }));
    assert.equal((await stored(guildId)).BlogFeed[0].URL, '');

    await hub.handleConfigModal(click(`cfg:modal:blog:message:${OWNER}`, { guildId, fields: { getTextInputValue: () => '✨ {title} is up! {link}' } }));
    doc = await stored(guildId);
    assert.equal(doc.BlogMessage[0].Message, '✨ {title} is up! {link}');

    const watcher = require('../src/blog/watcher');
    const previewOriginal = watcher.previewBlogPost;
    let previewed = null;
    watcher.previewBlogPost = async (data) => { previewed = data; return { payload: { content: 'preview', embeds: [] } }; };
    try {
        const press = click(`cfg:preview:blog:preview:${OWNER}`, { guildId });
        await hub.handleConfigComponent(press);
        assert.equal(press.replies[0].content, 'preview');
        assert.equal(press.replies[0].flags, MessageFlags.Ephemeral);
        assert.equal(previewed.BlogMessage[0].Message, '✨ {title} is up! {link}');
    } finally {
        watcher.previewBlogPost = previewOriginal;
    }
});

test('Anime News: switch, channel, ping role, site picks, message, and a private preview', async () => {
    const guildId = newGuild();
    const open = click(`cfg:nav:-:-:${OWNER}`, { guildId, values: ['news'] });
    await hub.handleConfigComponent(open);
    const view = open.updates[0];
    assert.equal(view.embeds[0].data.title, '🗞️ Anime News');
    assert.equal(field(view, 'Ping role'), 'No ping');
    assert.match(field(view, 'News sites'), /🟢 🍥 Crunchyroll News\n🟢 📡 Anime News Network\n⚫ 📘 MyAnimeList News/);
    const sitesMenu = components(view).find((entry) => entry.custom_id === `cfg:sources:news:sources:${OWNER}`);
    assert.ok(sitesMenu);
    assert.deepEqual(sitesMenu.options.filter((option) => option.default).map((option) => option.value), ['crunchyroll', 'ann']);
    assert.equal(sitesMenu.min_values, 0);

    await hub.handleConfigComponent(click(`cfg:on:news:status:${OWNER}`, { guildId }));
    await hub.handleConfigComponent(click(`cfg:channel:news:channel:${OWNER}`, { guildId, values: [CHANNEL], channels: [textChannel()] }));
    await hub.handleConfigComponent(click(`cfg:role:news:role:${OWNER}`, { guildId, values: [ROLE], roles: [role(ROLE, { position: 99 })] }));
    let doc = await stored(guildId);
    assert.equal(doc.NewsStatus[0].Status, 'true');
    assert.equal(doc.NewsChannel[0].Channel, CHANNEL);
    assert.equal(doc.NewsRole[0].Role, ROLE);
    assert.match(sections.homeEmbed(doc).data.description, new RegExp(`Anime News\\*\\* — 🟢 2 sites in <#${CHANNEL}>`));

    // Unknown values are dropped, and the list keeps the listed order.
    await hub.handleConfigComponent(click(`cfg:sources:news:sources:${OWNER}`, { guildId, values: ['anitrendz', 'nope', 'mal'] }));
    doc = await stored(guildId);
    assert.deepEqual(doc.NewsSources.map((entry) => entry.Source), ['mal', 'anitrendz']);
    await hub.handleConfigComponent(click(`cfg:sources:news:sources:${OWNER}`, { guildId, values: [] }));
    doc = await stored(guildId);
    assert.deepEqual(doc.NewsSources, []);
    assert.match(sections.sectionEmbed('news', doc).data.fields.find((entry) => entry.name === 'News sites').value, /No sites picked/);

    await hub.handleConfigModal(click(`cfg:modal:news:message:${OWNER}`, { guildId, fields: { getTextInputValue: () => '🗞️ {source}: {title}' } }));
    assert.equal((await stored(guildId)).NewsMessage[0].Message, '🗞️ {source}: {title}');

    const watcher = require('../src/news/watcher');
    const previewOriginal = watcher.previewNews;
    let previewed = null;
    watcher.previewNews = async (data) => { previewed = data; return { payload: { content: 'news preview', embeds: [] } }; };
    try {
        const press = click(`cfg:preview:news:preview:${OWNER}`, { guildId });
        await hub.handleConfigComponent(press);
        assert.equal(press.replies[0].content, 'news preview');
        assert.equal(press.replies[0].flags, MessageFlags.Ephemeral);
        assert.equal(previewed.NewsMessage[0].Message, '🗞️ {source}: {title}');
    } finally {
        watcher.previewNews = previewOriginal;
    }
});

test('Anime Releases: switch, channel, ping role, release types, message, and a private preview', async () => {
    const guildId = newGuild();
    const open = click(`cfg:nav:-:-:${OWNER}`, { guildId, values: ['releases'] });
    await hub.handleConfigComponent(open);
    const view = open.updates[0];
    assert.equal(view.embeds[0].data.title, '📺 Anime Releases');
    assert.match(field(view, 'Releases to post'), /🟢 🆕 New series premieres\n🟢 🔥 Popular shows\n⚫ 🏁 Season finales/);
    const menu = components(view).find((entry) => entry.custom_id === `cfg:sources:releases:sources:${OWNER}`);
    assert.ok(menu);
    assert.deepEqual(menu.options.filter((option) => option.default).map((option) => option.value), ['premieres', 'popular']);

    await hub.handleConfigComponent(click(`cfg:on:releases:status:${OWNER}`, { guildId }));
    await hub.handleConfigComponent(click(`cfg:channel:releases:channel:${OWNER}`, { guildId, values: [CHANNEL], channels: [textChannel()] }));
    await hub.handleConfigComponent(click(`cfg:role:releases:role:${OWNER}`, { guildId, values: [ROLE], roles: [role(ROLE, { position: 99 })] }));
    let doc = await stored(guildId);
    assert.equal(doc.ReleaseStatus[0].Status, 'true');
    assert.equal(doc.ReleaseChannel[0].Channel, CHANNEL);
    assert.equal(doc.ReleaseRole[0].Role, ROLE);
    assert.match(sections.homeEmbed(doc).data.description, new RegExp(`Anime Releases\\*\\* — 🟢 2 kinds in <#${CHANNEL}>`));

    await hub.handleConfigComponent(click(`cfg:sources:releases:sources:${OWNER}`, { guildId, values: ['all', 'crunchyroll', 'finales'] }));
    doc = await stored(guildId);
    assert.deepEqual(doc.ReleaseSources.map((entry) => entry.Source), ['finales', 'all'], 'news sites are not release types');
    assert.deepEqual(doc.NewsSources.map((entry) => entry.Source), ['crunchyroll', 'ann'], 'Anime News is untouched');
    await hub.handleConfigComponent(click(`cfg:sources:releases:sources:${OWNER}`, { guildId, values: [] }));
    assert.match(sections.sectionEmbed('releases', await stored(guildId)).data.fields.find((entry) => entry.name === 'Releases to post').value, /Nothing picked/);

    await hub.handleConfigModal(click(`cfg:modal:releases:message:${OWNER}`, { guildId, fields: { getTextInputValue: () => '{type}: {title}' } }));
    assert.equal((await stored(guildId)).ReleaseMessage[0].Message, '{type}: {title}');

    const watcher = require('../src/releases/watcher');
    const previewOriginal = watcher.previewReleases;
    watcher.previewReleases = async () => ({ payload: { content: 'release preview', embeds: [] } });
    try {
        const press = click(`cfg:preview:releases:preview:${OWNER}`, { guildId });
        await hub.handleConfigComponent(press);
        assert.equal(press.replies[0].content, 'release preview');
        assert.equal(press.replies[0].flags, MessageFlags.Ephemeral);
    } finally {
        watcher.previewReleases = previewOriginal;
    }
});
