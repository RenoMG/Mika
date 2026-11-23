const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.MIKADATABASE = process.env.MIKADATABASE || 'mongodb://127.0.0.1:9/mika-test';
process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const mongoose = require('mongoose');
mongoose.connect = async () => mongoose.connection;

const { Collection, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const guildConfig = require('../src/utils/getGuildConfig');
const { evaluateCommandGates, CATEGORY_DISABLED, CHANNEL_DISABLED, NO_USER_PERMISSION, NO_BOT_PERMISSION } = require('../src/utils/commandGates');
const interactionCreate = require('../src/events/interactionCreate');
const helpMenu = require('../src/commands/help/menu/helpMenu');

const commandDir = path.join(__dirname, '..', 'src', 'commands');
const modules = [];
for (const folder of fs.readdirSync(commandDir)) {
    const folderPath = path.join(commandDir, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath).filter((name) => name.endsWith('.js'))) {
        const loaded = require(path.join(folderPath, file));
        const list = loaded && Array.isArray(loaded.commands) ? loaded.commands : [loaded];
        for (const command of list) {
            if (!command?.data || typeof command.execute !== 'function') continue;
            modules.push(command);
        }
    }
}

const byName = Object.fromEntries(modules.map((command) => [command.data.name, command]));

function configDoc(overrides = {}) {
    return {
        ModerationCommandStatus: [{ Status: 'true' }],
        ImageCommandStatus: [{ Status: 'true' }],
        InfoCommandStatus: [{ Status: 'true' }],
        SocialCommandStatus: [{ Status: 'true' }],
        MemeCommandStatus: [{ Status: 'true' }],
        LevelingCommandStatus: [{ Status: 'true' }],
        DisabledChannels: [],
        ...overrides,
    };
}

function cloneCommand(command) {
    return {
        data: command.data,
        permissions: command.permissions,
        configKey: command.configKey,
        checkDisabledChannels: command.checkDisabledChannels,
        category: command.category,
        example: command.example,
        examples: command.examples,
        subcommandPermissions: command.subcommandPermissions,
        execute: async () => {},
    };
}

async function runInteraction(command, { memberHas = true, botHas = true, channelId = 'channel-1', config, chat = true, calls } = {}) {
    const replies = [];
    let executed = false;
    const wrapped = cloneCommand(command);
    wrapped.execute = async () => {
        executed = true;
    };
    const client = { commands: new Collection([[wrapped.data.name, wrapped]]) };
    const interaction = {
        commandName: chat ? wrapped.data.name : 'nope',
        isChatInputCommand: () => chat,
        guild: {
            id: 'guild-1',
            members: { me: { permissions: { has: () => botHas } } },
        },
        channel: { id: channelId },
        member: { permissions: { has: () => memberHas } },
        reply: async (payload) => {
            replies.push(payload);
        },
    };
    const original = guildConfig.getGuildConfig;
    guildConfig.getGuildConfig = async () => {
        if (calls) calls.push('getGuildConfig');
        return config;
    };
    try {
        await interactionCreate.execute(interaction, client);
    } finally {
        guildConfig.getGuildConfig = original;
    }
    return { replies, executed };
}

async function main() {
    const names = modules.map((command) => command.data.name).sort();
    const socialNames = require('../src/commands/social/data/entries').map((entry) => entry.name).sort();
    const expected = [
        'ban', 'unban', 'kick', 'mute', 'unmute', 'warn', 'unwarn',
        'clear', 'clearwarns', 'clearinfractions', 'infractions', 'removeinfraction',
        'whois', 'ping', 'invite', 'vote', 'pfp', 'status', 'serverstats',
        'level', 'leaderboard', 'image', 'meme', 'help', 'config',
        'search', 'recommend', 'setup', 'settings', 'profile', 'findprofile',
        'bio', 'watching', 'favorite', 'genres', 'randomanime',
        ...socialNames,
    ].sort();
    assert.deepEqual(names, expected);
    assert.equal(names.length, 53);
    assert.ok(names.length < 100, `root command count ${names.length}`);
    assert.equal(names.includes('social'), false);
    assert.equal(names.includes('info'), false);
    assert.equal(names.includes('levels'), false);

    const configurationFiles = fs.readdirSync(path.join(commandDir, 'configuration')).filter((name) => name.endsWith('.js'));
    assert.deepEqual(configurationFiles, ['config.js']);
    const helpFiles = fs.readdirSync(path.join(commandDir, 'help')).filter((name) => name.endsWith('.js'));
    assert.deepEqual(helpFiles, ['help.js']);
    const socialFiles = fs.readdirSync(path.join(commandDir, 'social')).filter((name) => name.endsWith('.js'));
    assert.deepEqual(socialFiles, ['social.js']);
    const welcomeHandler = require('../src/commands/configuration/handlers/welcome');
    assert.equal(typeof welcomeHandler, 'function');
    assert.equal(welcomeHandler.data, undefined);

    for (const command of modules) {
        const json = command.data.toJSON();
        assert.equal(json.contexts?.[0], 0, `${json.name} should be guild-only`);
        assert.equal(json.contexts.length, 1, json.name);
        assert.equal(json.dm_permission, undefined, json.name);
        assert.equal(typeof command.execute, 'function', json.name);
        assert.equal(typeof command.category, 'string', json.name);
        assert.equal(typeof command.example, 'string', json.name);
        assert.equal(typeof command.checkDisabledChannels, 'boolean', json.name);
    }

    assert.equal(byName.ban.data.toJSON().default_member_permissions, PermissionFlagsBits.BanMembers.toString());
    assert.equal(byName.unban.data.toJSON().default_member_permissions, PermissionFlagsBits.BanMembers.toString());
    assert.equal(byName.kick.data.toJSON().default_member_permissions, PermissionFlagsBits.KickMembers.toString());
    assert.equal(byName.mute.data.toJSON().default_member_permissions, PermissionFlagsBits.KickMembers.toString());
    assert.equal(byName.unmute.data.toJSON().default_member_permissions, PermissionFlagsBits.KickMembers.toString());
    assert.equal(byName.mute.botPermissions[0], PermissionFlagsBits.ManageRoles);
    assert.equal(byName.unmute.botPermissions[0], PermissionFlagsBits.ManageRoles);
    assert.equal(byName.warn.data.toJSON().default_member_permissions, PermissionFlagsBits.KickMembers.toString());
    assert.equal(byName.unwarn.data.toJSON().default_member_permissions, PermissionFlagsBits.KickMembers.toString());
    assert.equal(byName.clearwarns.data.toJSON().default_member_permissions, PermissionFlagsBits.KickMembers.toString());
    assert.equal(byName.clearinfractions.data.toJSON().default_member_permissions, PermissionFlagsBits.KickMembers.toString());
    assert.equal(byName.removeinfraction.data.toJSON().default_member_permissions, PermissionFlagsBits.KickMembers.toString());
    assert.equal(byName.clear.data.toJSON().default_member_permissions, PermissionFlagsBits.ManageMessages.toString());
    assert.equal(byName.infractions.data.toJSON().default_member_permissions, PermissionFlagsBits.KickMembers.toString());
    assert.equal(byName.config.data.toJSON().default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
    for (const name of ['help', 'image', 'meme', 'level', 'leaderboard', 'whois', 'ping', 'invite', 'vote', 'pfp', 'status', 'serverstats', 'search', 'recommend', 'randomanime', 'setup', 'settings', 'profile', 'findprofile', 'bio', 'watching', 'favorite', 'genres', ...socialNames]) {
        assert.equal(byName[name].data.toJSON().default_member_permissions, undefined, name);
        assert.equal(byName[name].permissions, undefined, name);
    }

    assert.equal(byName.image.checkDisabledChannels, false);
    assert.equal(byName.image.configKey, 'ImageCommandStatus');
    assert.equal(byName.help.configKey, undefined);
    assert.equal(byName.config.configKey, undefined);
    assert.equal(byName.help.checkDisabledChannels, true);
    assert.equal(byName.config.checkDisabledChannels, true);
    assert.equal(byName.ban.permissions.length, 1);
    assert.equal(byName.infractions.permissions[0], PermissionFlagsBits.KickMembers);
    assert.equal(byName.ban.data.toJSON().options.some((option) => option.type === 1), false);
    assert.equal(byName.image.data.toJSON().options.every((option) => option.type === 1), true);

    assert.equal(socialNames.length, 17);
    assert.ok(socialNames.includes('8ball'));
    assert.ok(socialNames.includes('hug'));
    for (const removed of ['dab', 'fu', 'joke', 'fact']) {
        assert.equal(socialNames.includes(removed), false, removed);
    }
    const hug = require('../src/commands/social/data/entries').find((entry) => entry.name === 'hug');
    assert.ok(hug.images.length > 0);
    assert.equal(hug.text, '**{user} hugs {member}{saying}**');

    const base = { command: cloneCommand(byName.ban), channelId: 'channel-1', memberHas: true, botHas: true };
    assert.equal(evaluateCommandGates({ ...base, config: configDoc() }), null);
    assert.equal(evaluateCommandGates({ ...base, memberHas: false, config: configDoc() }).content, NO_USER_PERMISSION);
    assert.equal(evaluateCommandGates({ ...base, memberHas: false, config: configDoc() }).flags, MessageFlags.Ephemeral);
    assert.equal(evaluateCommandGates({ ...base, botHas: false, config: configDoc() }).content, NO_BOT_PERMISSION);
    assert.equal(
        evaluateCommandGates({
            ...base,
            config: configDoc({ ModerationCommandStatus: [{ Status: 'false' }], DisabledChannels: [{ Channels: 'channel-1' }] }),
        }).content,
        CATEGORY_DISABLED,
    );
    assert.equal(
        evaluateCommandGates({
            ...base,
            config: configDoc({ DisabledChannels: [{ Channels: 'channel-1' }] }),
        }).content,
        CHANNEL_DISABLED,
    );

    const imageGate = { command: cloneCommand(byName.image), channelId: 'channel-1', memberHas: true, botHas: true };
    assert.equal(
        evaluateCommandGates({ ...imageGate, config: configDoc({ DisabledChannels: [{ Channels: 'channel-1' }] }) }),
        null,
    );
    assert.equal(
        evaluateCommandGates({ ...imageGate, config: configDoc({ ImageCommandStatus: [{ Status: 'false' }] }) }).content,
        CATEGORY_DISABLED,
    );

    const helpGate = { command: cloneCommand(byName.help), channelId: 'channel-1', memberHas: true, botHas: true };
    assert.equal(
        evaluateCommandGates({
            ...helpGate,
            config: configDoc({ InfoCommandStatus: [{ Status: 'false' }] }),
        }),
        null,
    );
    assert.equal(
        evaluateCommandGates({
            ...helpGate,
            config: configDoc({ DisabledChannels: [{ Channels: 'channel-1' }] }),
        }).content,
        CHANNEL_DISABLED,
    );

    const deniedCalls = [];
    const denied = await runInteraction(byName.ban, { memberHas: false, config: configDoc(), calls: deniedCalls });
    assert.equal(denied.executed, false);
    assert.equal(denied.replies[0].content, NO_USER_PERMISSION);
    assert.equal(denied.replies[0].flags, MessageFlags.Ephemeral);
    assert.deepEqual(deniedCalls, []);

    const botDenied = await runInteraction(byName.kick, { botHas: false, config: configDoc() });
    assert.equal(botDenied.executed, false);
    assert.equal(botDenied.replies[0].content, NO_BOT_PERMISSION);

    const categoryOff = await runInteraction(byName.meme, {
        config: configDoc({ MemeCommandStatus: [{ Status: 'false' }] }),
    });
    assert.equal(categoryOff.executed, false);
    assert.equal(categoryOff.replies[0].content, CATEGORY_DISABLED);
    assert.equal(categoryOff.replies[0].flags, MessageFlags.Ephemeral);

    const channelOff = await runInteraction(byName.hug, {
        channelId: 'quiet',
        config: configDoc({ DisabledChannels: [{ Channels: 'quiet' }] }),
    });
    assert.equal(channelOff.executed, false);
    assert.equal(channelOff.replies[0].content, CHANNEL_DISABLED);

    const imageAllowed = await runInteraction(byName.image, {
        channelId: 'quiet',
        config: configDoc({ DisabledChannels: [{ Channels: 'quiet' }] }),
    });
    assert.equal(imageAllowed.executed, true);
    assert.equal(imageAllowed.replies.length, 0);

    const helpBlocked = await runInteraction(byName.help, {
        channelId: 'quiet',
        config: configDoc({ DisabledChannels: [{ Channels: 'quiet' }], InfoCommandStatus: [{ Status: 'false' }] }),
    });
    assert.equal(helpBlocked.executed, false);
    assert.equal(helpBlocked.replies[0].content, CHANNEL_DISABLED);

    const allowed = await runInteraction(byName.ping, { config: configDoc() });
    assert.equal(allowed.executed, true);

    const ignored = await runInteraction(byName.ban, { chat: false, config: configDoc() });
    assert.equal(ignored.executed, false);
    assert.equal(ignored.replies.length, 0);

    const client = { commands: new Collection(modules.map((command) => [command.data.name, command])) };
    const categories = helpMenu.groupCommands(client.commands);
    assert.ok(categories.length > 5);
    assert.equal(helpMenu.componentMode(categories.length), 'select');
    assert.equal(helpMenu.componentMode(2), 'buttons');

    const home = helpMenu.buildHelpView(categories, null);
    const homeJson = home.components.map((row) => row.toJSON());
    assert.equal(homeJson[0].components[0].custom_id, helpMenu.SELECT_CUSTOM_ID);
    assert.equal(homeJson[0].components[0].options.length, categories.length);
    assert.equal(homeJson[1].components[0].custom_id, helpMenu.HOME_CUSTOM_ID);
    assert.equal(homeJson[1].components[0].label, 'Home');
    assert.match(home.embeds[0].data.description, /discord\.gg\/7uyR6g2N4K/);
    assert.match(home.embeds[0].data.description, /\/help/);
    assert.equal(home.embeds[0].data.footer.text, 'Mika | ❓ help');
    assert.ok(!categories.some((category) => category.id === 'help'));
    assert.ok(!homeJson[0].components[0].options.some((option) => option.value === 'help'));

    const moderation = helpMenu.buildHelpView(categories, 'moderation');
    const moderationText = moderation.embeds.map((embed) => embed.data.description).join('\n');
    assert.match(moderationText, /\/warn target:@user reason:spamming/);
    assert.match(moderationText, /\/unban id:/);
    assert.match(moderationText, /\/unmute target:@user/);
    assert.match(moderationText, /\/removeinfraction/);
    assert.doesNotMatch(moderationText, /\/ban add/);
    assert.doesNotMatch(moderationText, /\/infractions total/);
    assert.match(moderationText, /Requires Kick Members/);
    assert.match(moderationText, /Requires Ban Members/);
    assert.match(moderationText, /Requires Manage Messages/);

    const disabled = helpMenu.buildHelpView(categories, 'moderation', { disabled: true });
    const disabledJson = disabled.components.map((row) => row.toJSON());
    assert.equal(disabledJson[0].components[0].disabled, true);
    assert.equal(disabledJson[1].components[0].disabled, true);

    const buttonCategories = categories.slice(0, 2);
    const buttons = helpMenu.buildHelpView(buttonCategories, buttonCategories[0].id);
    const buttonRow = buttons.components[0].toJSON().components;
    assert.equal(buttonRow.length, 3);
    assert.equal(buttonRow[2].custom_id, helpMenu.HOME_CUSTOM_ID);
    assert.equal(helpMenu.selectionFrom({ customId: helpMenu.HOME_CUSTOM_ID }).id, null);
    assert.equal(helpMenu.selectionFrom({ customId: helpMenu.SELECT_CUSTOM_ID, values: ['social'] }).id, 'social');
    assert.equal(helpMenu.selectionFrom({ customId: `${helpMenu.CATEGORY_BUTTON_PREFIX}image` }).id, 'image');
    assert.equal(helpMenu.selectionFrom({ customId: 'other' }), null);

    const socialView = helpMenu.buildHelpView(categories, 'social');
    const socialText = socialView.embeds.map((embed) => embed.data.description).join('\n');
    assert.match(socialText, /\/hug target:@user/);
    assert.match(socialText, /Hugs the mentioned user/);
    assert.doesNotMatch(socialText, /\*\*\/dab/);
    assert.doesNotMatch(socialText, /\*\*\/fu\*\*/);
    assert.doesNotMatch(socialText, /\*\*\/social /);
    assert.doesNotMatch(socialText, /\*\*\/social\*\* —/);
    assert.ok(socialView.embeds.every((embed) => embed.data.description.length <= 4096));

    const levelingView = helpMenu.buildHelpView(categories, 'leveling');
    const levelingText = levelingView.embeds.map((embed) => embed.data.description).join('\n');
    assert.match(levelingText, /\*\*\/level\*\* — Shows your rank card, or another member's\./);
    assert.match(levelingText, /`\/level target:@user`/);
    assert.match(levelingText, /\*\*\/leaderboard\*\*/);
    assert.match(levelingText, /`\/leaderboard`/);
    assert.doesNotMatch(levelingText, /\*\*\/levels /);

    function pathsFor(command) {
        const json = command.data.toJSON();
        const subs = [];
        for (const option of json.options || []) {
            if (option.type === 1) subs.push(`${json.name} ${option.name}`);
            else if (option.type === 2) {
                for (const sub of option.options || []) {
                    if (sub.type === 1) subs.push(`${json.name} ${option.name} ${sub.name}`);
                }
            }
        }
        return subs;
    }

    for (const category of categories) {
        const view = helpMenu.buildHelpView(categories, category.id);
        const text = view.embeds.map((embed) => embed.data.description || '').join('\n');
        for (const embed of view.embeds) {
            const data = embed.data;
            assert.ok((data.description || '').length <= 4096, category.id);
            const fields = data.fields || [];
            assert.ok(fields.length <= 25, category.id);
            for (const field of fields) {
                assert.ok(field.name.length <= 256, category.id);
                assert.ok(field.value.length <= 1024, category.id);
            }
            const total = (data.title || '').length
                + (data.description || '').length
                + (data.footer?.text || '').length
                + fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
            assert.ok(total <= 6000, category.id);
        }
        for (const command of category.commands) {
            const json = command.data.toJSON();
            const subs = pathsFor(command);
            if (subs.length === 0) {
                assert.match(text, new RegExp(`\\*\\*/${json.name}\\*\\*`));
                assert.match(text, new RegExp(`\`/${json.name}[^\`]*\``));
            } else {
                assert.doesNotMatch(text, new RegExp(`\\*\\*/${json.name}\\*\\* —`));
                for (const path of subs) {
                    assert.match(text, new RegExp(`\\*\\*/${path}\\*\\*`));
                    assert.match(text, new RegExp(`\`/${path}[^\`]*\``));
                }
            }
        }
    }

    const bulkExamples = {};
    const bulk = new SlashCommandBuilder().setName('bulk').setDescription('Bulk commands.');
    for (let index = 0; index < 25; index += 1) {
        const name = `sub${String(index).padStart(2, '0')}`;
        bulk.addSubcommand((sub) => sub.setName(name).setDescription('d'.repeat(100)));
        bulkExamples[name] = `/bulk ${name} ${'example '.repeat(20)}`.trim();
    }
    const bulkCommand = {
        data: bulk,
        category: 'bulk',
        example: '/bulk sub00',
        examples: bulkExamples,
        checkDisabledChannels: false,
    };
    const bulkCategories = helpMenu.groupCommands([bulkCommand]);
    const bulkView = helpMenu.buildHelpView(bulkCategories, 'bulk');
    const bulkText = bulkView.embeds.map((embed) => embed.data.description).join('\n');
    assert.ok(bulkView.embeds.length > 1);
    assert.match(bulkText, /\*\*\/bulk sub00\*\*/);
    assert.match(bulkText, /\*\*\/bulk sub24\*\*/);
    assert.doesNotMatch(bulkText, /\*\*\/bulk\*\* —/);
    for (const embed of bulkView.embeds) {
        assert.ok(embed.data.description.length <= 4096);
        const total = embed.data.title.length + embed.data.description.length + embed.data.footer.text.length;
        assert.ok(total <= 6000);
    }

    console.log('command gate and help menu tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
