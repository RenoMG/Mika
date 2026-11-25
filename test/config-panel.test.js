const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const {
    ChannelType,
    ComponentType,
    MessageFlags,
    PermissionFlagsBits,
    TextInputStyle,
} = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const OWNER = '100000000000000031';
const OTHER = '100000000000000032';
const CHANNEL = '123456789012345678';
const ROLE = '223456789012345678';

const LABELS = {
    welcome: [
        'Greeting message channel',
        'Farewell message channel',
        'Greeting message',
        'Farewell message',
        'Greeting on/off',
        'Farewell on/off',
    ],
    commands: [
        'Moderation on/off',
        'Meme on/off',
        'Information on/off',
        'Add restricted channel',
        'Remove restricted channel',
    ],
    logging: ['Logging on/off', 'Logging channel'],
    autorole: ['Auto-role on/off', 'Auto-role role'],
    muterole: ['Mute role'],
    leveling: ['Leveling on/off', 'Level-up message', 'Level-up channel'],
    guess: ['Auto-drop on/off', 'Drop channel', 'Drop interval'],
};

let mongoose;
let mongod;
let panel;
let configCommand;
let interactionCreate;
let ConfigurationDB;

function member(allowed = true) {
    return {
        permissions: {
            has(bit) {
                if (!allowed) return false;
                const bits = Array.isArray(bit) ? bit : [bit];
                return bits.length > 0 && bits.every((entry) => entry === PermissionFlagsBits.ManageGuild);
            },
        },
    };
}

function component(overrides = {}) {
    const replies = [];
    const updates = [];
    const modals = [];
    const interaction = {
        customId: overrides.customId,
        values: overrides.values || [],
        user: { id: overrides.userId || OWNER },
        guild: overrides.guild === null ? null : { id: overrides.guildId || 'panel-guild' },
        member: overrides.member || member(overrides.allowed !== false),
        channels: overrides.channels,
        roles: overrides.roles,
        message: overrides.message,
        fields: overrides.fields,
        replied: false,
        deferred: false,
        replies,
        updates,
        modals,
        async reply(body) {
            replies.push(body);
        },
        async update(body) {
            updates.push(body);
        },
        async showModal(modal) {
            modals.push(modal);
        },
    };
    return interaction;
}

function textChannel(id, type = ChannelType.GuildText) {
    return {
        first() {
            return {
                id,
                type,
                toString() {
                    throw new TypeError("Cannot read properties of null (reading 'toString')");
                },
            };
        },
    };
}

function fieldValue(embeds, description, name) {
    const page = embeds.find((embed) => embed.data.title === description);
    assert.ok(page, description);
    const field = page.data.fields.find((entry) => entry.name === name);
    assert.ok(field, name);
    return field.value;
}

function menuOptions(payload) {
    return payload.components[0].toJSON().components[0].options.map((option) => option.label);
}

before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoose = require('mongoose');
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
    process.env.MIKADATABASE = mongod.getUri();
    process.env.MIKADATABASENAME = 'mika';
    await mongoose.connect(process.env.MIKADATABASE, { dbName: 'mika' });
    panel = require('../src/commands/configuration/handlers/panel');
    configCommand = require('../src/commands/configuration/config');
    interactionCreate = require('../src/events/interactionCreate');
    ConfigurationDB = require('../src/Models/ConfigurationDB');
}, { timeout: 180000 });

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

test('/config sections take no options and every menu uses full words', () => {
    const names = configCommand.data.toJSON().options.map((option) => option.name);
    assert.deepEqual(names, ['welcome', 'command', 'info', 'logging', 'autorole', 'muterole', 'leveling', 'guess']);
    for (const sub of configCommand.data.toJSON().options) {
        assert.equal(sub.type, 1, sub.name);
        assert.ok(!sub.options || sub.options.length === 0, sub.name);
    }
    assert.deepEqual(Object.keys(panel.FIELDS), Object.keys(LABELS));
    for (const [section, labels] of Object.entries(LABELS)) {
        assert.deepEqual(panel.FIELDS[section].map((field) => field.label), labels);
        const view = panel.overviewView({}, section, OWNER);
        assert.deepEqual(menuOptions(view), labels);
        for (const label of labels) {
            assert.equal(label.includes('-channel'), false, label);
            assert.match(label, /^[A-Z]/);
        }
    }
    assert.deepEqual(panel.FIELDS.leveling.map((field) => field.id), ['status', 'message', 'channel']);
});

test('the section menu routes channels, toggles, roles, and text', async () => {
    const guildId = 'panel-route';
    const welcome = component({
        customId: `cfg:menu:welcome:-:${OWNER}`,
        values: ['gchannel'],
        guildId,
    });
    await panel.handleConfigComponent(welcome);
    const channelMenu = welcome.updates[0].components[0].toJSON().components[0];
    assert.equal(channelMenu.type, ComponentType.ChannelSelect);
    assert.deepEqual(channelMenu.channel_types, [ChannelType.GuildText]);
    assert.equal(welcome.updates[0].components[1].toJSON().components[0].label, 'Back');
    assert.equal(welcome.modals.length, 0);

    const toggle = component({
        customId: `cfg:menu:welcome:-:${OWNER}`,
        values: ['greeting'],
        guildId,
    });
    await panel.handleConfigComponent(toggle);
    assert.deepEqual(
        toggle.updates[0].components[0].toJSON().components.map((button) => button.label),
        ['Enable', 'Disable', 'Back'],
    );

    const text = component({
        customId: `cfg:menu:welcome:-:${OWNER}`,
        values: ['gmessage'],
        guildId,
    });
    await panel.handleConfigComponent(text);
    assert.equal(text.updates.length, 0);
    const input = text.modals[0].toJSON().components[0].components[0];
    assert.equal(input.style, TextInputStyle.Paragraph);
    assert.equal(input.max_length, panel.TEXT_MAX);
    assert.equal(input.value, 'Welcome to the server {userd}!');
    assert.match(input.placeholder, /\{user\}=mention/);
    assert.match(input.label, /Greeting message/);

    const levelText = component({
        customId: `cfg:menu:leveling:-:${OWNER}`,
        values: ['message'],
        guildId: 'panel-level-blank',
    });
    await panel.handleConfigComponent(levelText);
    const levelInput = levelText.modals[0].toJSON().components[0].components[0];
    assert.equal(levelInput.value, undefined);
    assert.match(levelInput.placeholder, /\{level\}/);
    assert.match(levelInput.placeholder, /default/i);

    const role = component({
        customId: `cfg:menu:muterole:-:${OWNER}`,
        values: ['role'],
        guildId,
    });
    await panel.handleConfigComponent(role);
    assert.equal(role.updates[0].components[0].toJSON().components[0].type, ComponentType.RoleSelect);

    const back = component({ customId: `cfg:back:welcome:-:${OWNER}`, guildId });
    await panel.handleConfigComponent(back);
    assert.equal(back.updates[0].components[0].toJSON().components[0].type, ComponentType.StringSelect);
    assert.deepEqual(menuOptions(back.updates[0]), LABELS.welcome);

    const unknown = component({
        customId: `cfg:menu:welcome:-:${OWNER}`,
        values: ['g-channel'],
        guildId,
    });
    await panel.handleConfigComponent(unknown);
    assert.equal(unknown.updates.length, 0);
    assert.equal(unknown.replies[0].content, panel.STALE);
});

test('a change updates the overview embed in place', async () => {
    const guildId = 'panel-update';
    const channel = component({
        customId: `cfg:channel:welcome:gchannel:${OWNER}`,
        guildId,
        channels: textChannel(CHANNEL),
    });
    await panel.handleConfigComponent(channel);
    assert.equal(channel.replies.length, 0);
    assert.match(fieldValue(channel.updates[0].embeds, '👋 Welcome', 'Greeting channel'), new RegExp(`<#${CHANNEL}>`));
    let saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.GreetingChannel[0].Channel, CHANNEL);
    assert.equal(saved.FarewellChannel[0].Channel, '');

    const text = component({
        customId: `cfg:modal:welcome:gmessage:${OWNER}`,
        guildId,
        fields: { getTextInputValue: () => 'Hello {user}' },
    });
    await panel.handleConfigModal(text);
    assert.equal(text.replies.length, 0);
    assert.equal(fieldValue(text.updates[0].embeds, '👋 Welcome', 'Greeting message'), 'Hello {user}');
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.GreetingMessage[0].Message, 'Hello {user}');

    const enable = component({
        customId: `cfg:on:welcome:greeting:${OWNER}`,
        guildId,
    });
    await panel.handleConfigComponent(enable);
    assert.equal(fieldValue(enable.updates[0].embeds, '👋 Welcome', 'Greeting'), '🟢 On');
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.GreetingStatus[0].Status, 'true');

    const reset = component({
        customId: `cfg:modal:leveling:message:${OWNER}`,
        guildId: 'panel-default',
        fields: { getTextInputValue: () => ' Default ' },
    });
    await panel.handleConfigModal(reset);
    saved = await ConfigurationDB.findOne({ GuildID: 'panel-default' });
    assert.equal(saved.Levelupmessage[0].Message, '');
    assert.match(fieldValue(reset.updates[0].embeds, '🏆 Leveling', 'Level-up message'), /Default:/);

    const kept = component({
        customId: `cfg:modal:leveling:message:${OWNER}`,
        guildId: 'panel-default',
        fields: { getTextInputValue: () => 'my default message' },
    });
    await panel.handleConfigModal(kept);
    saved = await ConfigurationDB.findOne({ GuildID: 'panel-default' });
    assert.equal(saved.Levelupmessage[0].Message, 'my default message');

    const tooLong = component({
        customId: `cfg:modal:welcome:gmessage:${OWNER}`,
        guildId,
        fields: { getTextInputValue: () => 'x'.repeat(panel.TEXT_MAX + 1) },
    });
    await panel.handleConfigModal(tooLong);
    assert.equal(tooLong.replies[0].content, panel.TOO_LONG);
    assert.equal(tooLong.updates.length, 0);
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.GreetingMessage[0].Message, 'Hello {user}');
});

test('components and modals recheck Manage Server, and only the invoker is allowed', async () => {
    const guildId = 'panel-guard';
    const stranger = component({
        customId: `cfg:menu:welcome:-:${OWNER}`,
        values: ['gmessage'],
        userId: OTHER,
        guildId,
        allowed: true,
    });
    await panel.handleConfigComponent(stranger);
    assert.equal(stranger.replies[0].content, panel.ONLY_OWNER);
    assert.equal(stranger.replies[0].flags, MessageFlags.Ephemeral);
    assert.deepEqual(stranger.replies[0].allowedMentions.parse, []);
    assert.equal(stranger.modals.length, 0);
    assert.equal(stranger.updates.length, 0);

    const denied = component({
        customId: `cfg:menu:welcome:-:${OWNER}`,
        values: ['gmessage'],
        guildId,
        allowed: false,
    });
    await panel.handleConfigComponent(denied);
    assert.equal(denied.replies[0].content, panel.NEED_MANAGE);
    assert.equal(denied.modals.length, 0);

    const modalDenied = component({
        customId: `cfg:modal:welcome:gmessage:${OWNER}`,
        guildId,
        allowed: false,
        fields: { getTextInputValue: () => 'hacked' },
    });
    await panel.handleConfigModal(modalDenied);
    assert.equal(modalDenied.replies[0].content, panel.NEED_MANAGE);
    assert.equal(modalDenied.updates.length, 0);
    assert.equal(await ConfigurationDB.findOne({ GuildID: guildId }), null);

    const wired = component({
        customId: `cfg:menu:leveling:-:${OWNER}`,
        values: ['status'],
        userId: OTHER,
        guildId: 'panel-wired',
    });
    await interactionCreate.execute({
        ...wired,
        isButton: () => false,
        isStringSelectMenu: () => true,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        isAutocomplete: () => false,
        isModalSubmit: () => false,
        isChatInputCommand: () => false,
    }, { commands: new Map() });
    assert.equal(wired.replies[0].content, panel.ONLY_OWNER);

    const wiredModal = component({
        customId: `cfg:modal:leveling:message:${OWNER}`,
        guildId: 'panel-wired-modal',
        allowed: false,
        fields: { getTextInputValue: () => 'hacked' },
    });
    await interactionCreate.execute({
        ...wiredModal,
        isButton: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        isAutocomplete: () => false,
        isModalSubmit: () => true,
        isChatInputCommand: () => false,
    }, { commands: new Map() });
    assert.equal(wiredModal.replies[0].content, panel.NEED_MANAGE);
    assert.equal(await ConfigurationDB.findOne({ GuildID: 'panel-wired-modal' }), null);
});

test('a modal uses the text input and the live guild, not the custom id', async () => {
    const guildId = 'panel-trust';
    const noGuild = component({
        customId: `cfg:modal:welcome:gmessage:${OWNER}`,
        guild: null,
        fields: { getTextInputValue: () => 'from-input' },
    });
    await panel.handleConfigModal(noGuild);
    assert.equal(noGuild.replies[0].content, panel.SERVER_ONLY);
    assert.equal(await ConfigurationDB.findOne({ GuildID: OWNER }), null);

    const wrongShape = component({
        customId: `cfg:modal:welcome:gmessage:${OWNER}:other-guild`,
        guildId,
        fields: { getTextInputValue: () => 'from-input' },
    });
    await panel.handleConfigModal(wrongShape);
    assert.equal(wrongShape.replies[0].content, panel.STALE);
    assert.equal(await ConfigurationDB.findOne({ GuildID: guildId }), null);

    const wrongField = component({
        customId: `cfg:modal:welcome:gchannel:${OWNER}`,
        guildId,
        fields: { getTextInputValue: () => CHANNEL },
    });
    await panel.handleConfigModal(wrongField);
    assert.equal(wrongField.replies[0].content, panel.STALE);

    const wrongAction = component({
        customId: `cfg:on:welcome:gmessage:${OWNER}`,
        guildId,
    });
    await panel.handleConfigComponent(wrongAction);
    assert.equal(wrongAction.replies[0].content, panel.STALE);
    assert.equal(await ConfigurationDB.findOne({ GuildID: guildId }), null);

    const saved = component({
        customId: `cfg:modal:welcome:fmessage:${OWNER}`,
        guildId,
        fields: { getTextInputValue: () => 'Bye {userd}' },
    });
    await panel.handleConfigModal(saved);
    const doc = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(doc.FarewellMessage[0].Message, 'Bye {userd}');
    assert.equal(doc.GreetingChannel[0].Channel, '');
});

test('restricted channels, mute role, null legacy fields, and text channels keep the old storage', async () => {
    const guildId = 'panel-storage';
    const add = component({
        customId: `cfg:channel:commands:addchannel:${OWNER}`,
        guildId,
        values: [CHANNEL],
    });
    await panel.handleConfigComponent(add);
    let saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.DisabledChannels[0].Channels, CHANNEL);
    assert.match(fieldValue(add.updates[0].embeds, '🧩 Commands', 'Restricted channels'), new RegExp(`<#${CHANNEL}>`));

    const remove = component({
        customId: `cfg:channel:commands:removechannel:${OWNER}`,
        guildId,
        values: [CHANNEL],
    });
    await panel.handleConfigComponent(remove);
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.deepEqual(saved.DisabledChannels, []);
    assert.match(fieldValue(remove.updates[0].embeds, '🧩 Commands', 'Restricted channels'), /None/);

    const voice = component({
        customId: `cfg:channel:logging:channel:${OWNER}`,
        guildId,
        channels: textChannel(CHANNEL, ChannelType.GuildVoice),
    });
    await panel.handleConfigComponent(voice);
    assert.equal(voice.replies[0].content, 'Pick a text channel.');
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.LoggingChannel[0].Channel, '');

    const awkward = component({
        customId: `cfg:channel:leveling:channel:${OWNER}`,
        guildId: 'panel-awkward',
        channels: textChannel('4242'),
    });
    await panel.handleConfigComponent(awkward);
    saved = await ConfigurationDB.findOne({ GuildID: 'panel-awkward' });
    assert.equal(saved.Levelupchannel[0].Channel, '4242');

    const blocked = component({
        customId: `cfg:role:muterole:role:${OWNER}`,
        guildId,
        roles: { first: () => ({ id: ROLE, editable: false }) },
    });
    await panel.handleConfigComponent(blocked);
    assert.match(blocked.replies[0].content, /ordinary server role/);
    assert.equal(blocked.updates.length, 0);
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.Muterole[0].Role, '');

    const mute = component({
        customId: `cfg:role:muterole:role:${OWNER}`,
        guildId,
        roles: { first: () => ({ id: ROLE, editable: true, position: 1, permissions: { has: () => false } }) },
        member: { id: OWNER, permissions: { has: () => true }, roles: { highest: { position: 5 } } },
    });
    mute.guild.members = { me: { permissions: { has: () => true }, roles: { highest: { position: 10 } } } };
    await panel.handleConfigComponent(mute);
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.Muterole[0].Role, ROLE);
    assert.match(fieldValue(mute.updates[0].embeds, '🔇 Mute role', 'Mute role'), new RegExp(`<@&${ROLE}>`));

    await ConfigurationDB.collection.insertOne({
        GuildID: 'panel-null',
        LevelingCommandStatus: null,
        Levelupchannel: null,
        Levelupmessage: null,
    });
    const legacy = component({
        customId: `cfg:on:leveling:status:${OWNER}`,
        guildId: 'panel-null',
    });
    await panel.handleConfigComponent(legacy);
    const old = await ConfigurationDB.findOne({ GuildID: 'panel-null' });
    assert.equal(old.LevelingCommandStatus[0].Status, 'true');
    assert.equal(old.Levelupchannel, null);
    assert.equal(old.Levelupmessage, null);
});

test('an expired panel disables its menu, and 10062/40060 do not crash or get logged', async () => {
    const guildId = 'panel-expire';
    const replies = [];
    const edits = [];
    let collector;
    await configCommand.execute({
        user: { id: OWNER },
        guild: { id: guildId },
        member: member(true),
        options: { getSubcommand: () => 'welcome' },
        async reply(body) {
            replies.push(body);
            return {
                resource: {
                    message: {
                        id: 'panel-msg',
                        createMessageComponentCollector() {
                            const handlers = {};
                            collector = {
                                on(event, handler) {
                                    handlers[event] = handler;
                                    return collector;
                                },
                                handlers,
                            };
                            return collector;
                        },
                    },
                },
            };
        },
        editReply: async (body) => edits.push(body),
    });
    assert.equal(replies[0].flags, MessageFlags.Ephemeral);
    assert.deepEqual(replies[0].allowedMentions.parse, []);
    assert.equal(replies[0].embeds[0].data.title, '👋 Welcome');
    assert.deepEqual(menuOptions(replies[0]), LABELS.welcome);
    assert.equal(panel.PANEL_TIMEOUT_MS, 120000);

    await collector.handlers.end();
    assert.equal(edits[0].content, panel.EXPIRED);
    assert.equal(edits[0].components[0].toJSON().components[0].disabled, true);
    assert.equal(edits[0].embeds[0].data.title, '👋 Welcome');

    const after = component({
        customId: `cfg:modal:welcome:gmessage:${OWNER}`,
        guildId,
        message: { id: 'panel-msg' },
        fields: { getTextInputValue: () => 'Still saved' },
    });
    await panel.handleConfigModal(after);
    assert.equal(after.updates[0].content, panel.EXPIRED);
    assert.equal(after.updates[0].components[0].toJSON().components[0].disabled, true);
    assert.equal(fieldValue(after.updates[0].embeds, '👋 Welcome', 'Greeting message'), 'Still saved');

    const boom = Object.assign(new Error('Unknown interaction'), { code: 10062 });
    const acknowledged = Object.assign(new Error('already acknowledged'), { code: 40060 });
    for (const error of [boom, acknowledged]) {
        let end;
        await configCommand.execute({
            user: { id: OWNER },
            guild: { id: `panel-quiet-end-${error.code}` },
            member: member(true),
            options: { getSubcommand: () => 'logging' },
            async reply() {
                return {
                    resource: {
                        message: {
                            id: `quiet-end-${error.code}`,
                            createMessageComponentCollector() {
                                return {
                                    on(event, handler) {
                                        if (event === 'end') end = handler;
                                        return this;
                                    },
                                };
                            },
                        },
                    },
                };
            },
            async editReply() {
                throw error;
            },
        });
        await end();
    }

    const logs = [];
    const original = console.error;
    console.error = (line) => logs.push(String(line));
    try {
        for (const error of [boom, acknowledged]) {
            await panel.handleConfigComponent({
                customId: `cfg:on:logging:status:${OWNER}`,
                user: { id: OWNER },
                guild: { id: 'panel-quiet' },
                member: member(true),
                async update() {
                    throw error;
                },
                async reply() {
                    throw new Error('must not reply after a quiet update failure');
                },
            });
        }
        assert.equal(logs.length, 0);
    } finally {
        console.error = original;
    }
});
