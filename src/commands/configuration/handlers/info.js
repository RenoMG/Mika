const { redact } = require('../../../utils/redact');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    StringSelectMenuBuilder,
} = require('discord.js');
const { defer, finish, replyWithMessage } = require('../../../utils/ack');
const { allowedMentions } = require('../../../utils/mentions');
const { embed: styledEmbed, footerText } = require('../../../utils/style');
const { getGuildConfig } = require('../../../utils/getGuildConfig');
const { embedValue, listValues, statusText } = require('./configFields');
const { intervalMinutes } = require('../../../guess/settings');
const {
    DEFAULT_FAREWELL_MESSAGE,
    DEFAULT_GREETING_MESSAGE,
    DEFAULT_LEVEL_MESSAGE,
} = require('../../../utils/formatMessage');

const CONFIG_TIMEOUT_MS = 120000;
const SELECT_CUSTOM_ID = 'configinfo:section';
const HOME_CUSTOM_ID = 'configinfo:home';
const FOOTER = footerText('config');
const ONLY_OWNER = 'Only the person who used /config info can use this menu.';

const CONFIG_SECTIONS = [
    { id: 'welcome', label: 'Welcome', emoji: '👋', blurb: 'Greeting and farewell messages.' },
    { id: 'commands', label: 'Commands', emoji: '🧩', blurb: 'Which command groups are on.' },
    { id: 'logging', label: 'Logging', emoji: '📑', blurb: 'Log channel and status.' },
    { id: 'autorole', label: 'Auto-role', emoji: '🎭', blurb: 'Role given to new members.' },
    { id: 'muterole', label: 'Mute role', emoji: '🔇', blurb: 'Role used for mutes.' },
    { id: 'leveling', label: 'Leveling', emoji: '🏆', blurb: 'Level-up channel and message.' },
    { id: 'guess', label: 'Guess That Anime', emoji: '🎯', blurb: 'Auto-drop channel and interval.' },
    { id: 'feed', label: 'Watch Feed', emoji: '📣', blurb: "Channel for members' anime list updates." },
];

function enabledLabel(list) {
    return statusText(list) === 'true' ? '🟢 On' : '🔴 Off';
}

function channelValue(list) {
    const ids = listValues(list, 'Channel');
    if (ids.length < 1) return 'Not set';
    return ids.map((id) => `<#${id}>`).join(' ');
}

function roleValue(list) {
    const ids = listValues(list, 'Role');
    if (ids.length < 1) return 'Not set';
    return ids.map((id) => `<@&${id}>`).join(' ');
}

function messageValue(list, fallback) {
    const messages = listValues(list, 'Message');
    const saved = messages.join('').trim();
    if (!saved) return embedValue(`*Default:* ${fallback}`);
    return embedValue(messages.join(''));
}

function sectionEmbed(sectionId, fields) {
    const section = CONFIG_SECTIONS.find((item) => item.id === sectionId);
    return styledEmbed({ title: `${section.emoji} ${section.label}`, label: 'config' }).addFields(fields);
}

const TOKENS = '`{user}` mention · `{userd}` display name';

function configInfoEmbeds(data) {
    const disabledIds = listValues(data.DisabledChannels, 'Channels');
    const welcome = sectionEmbed('welcome', [
        { name: 'Greeting', value: enabledLabel(data.GreetingStatus), inline: true },
        { name: 'Greeting channel', value: channelValue(data.GreetingChannel), inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: 'Farewell', value: enabledLabel(data.FarewellStatus), inline: true },
        { name: 'Farewell channel', value: channelValue(data.FarewellChannel), inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: 'Greeting message', value: messageValue(data.GreetingMessage, DEFAULT_GREETING_MESSAGE), inline: false },
        { name: 'Farewell message', value: messageValue(data.FarewellMessage, DEFAULT_FAREWELL_MESSAGE), inline: false },
        { name: 'Placeholders', value: TOKENS, inline: false },
    ]);

    const commands = sectionEmbed('commands', [
        { name: 'Moderation', value: enabledLabel(data.ModerationCommandStatus), inline: true },
        { name: 'Memes', value: enabledLabel(data.MemeCommandStatus), inline: true },
        { name: 'Information', value: enabledLabel(data.InfoCommandStatus), inline: true },
        {
            name: 'Restricted channels',
            value: embedValue(disabledIds.length ? disabledIds.map((id) => `• <#${id}>`).join('\n') : 'None'),
            inline: false,
        },
    ]);

    const logging = sectionEmbed('logging', [
        { name: 'Logging', value: enabledLabel(data.LoggingStatus), inline: true },
        { name: 'Log channel', value: channelValue(data.LoggingChannel), inline: true },
    ]);

    const autorole = sectionEmbed('autorole', [
        { name: 'Auto-role', value: enabledLabel(data.AutoroleStatus), inline: true },
        { name: 'Role', value: roleValue(data.AutoroleRole), inline: true },
    ]);

    const muterole = sectionEmbed('muterole', [
        { name: 'Mute role', value: roleValue(data.Muterole), inline: true },
    ]);

    const leveling = sectionEmbed('leveling', [
        { name: 'Leveling', value: enabledLabel(data.LevelingCommandStatus), inline: true },
        { name: 'Level-up channel', value: listValues(data.Levelupchannel, 'Channel').length ? channelValue(data.Levelupchannel) : 'Same channel as the message', inline: true },
        { name: 'Level-up message', value: messageValue(data.Levelupmessage, DEFAULT_LEVEL_MESSAGE), inline: false },
        { name: 'Placeholders', value: `${TOKENS} · \`{level}\` new level`, inline: false },
    ]);

    // Same reading the scheduler uses, so the panel shows the interval that actually runs.
    const guessEvery = intervalMinutes(data);
    const guess = sectionEmbed('guess', [
        { name: 'Auto-drop', value: enabledLabel(data.GuessStatus), inline: true },
        { name: 'Drop channel', value: channelValue(data.GuessChannel), inline: true },
        { name: 'Drop interval', value: `Every **${guessEvery} minutes**`, inline: true },
    ]);

    const feed = sectionEmbed('feed', [
        { name: 'Watch Feed', value: enabledLabel(data.FeedStatus), inline: true },
        { name: 'Feed channel', value: channelValue(data.FeedChannel), inline: true },
        {
            name: 'How it works',
            value: 'Members who turn on `activity` in /settings get their list updates posted here: new shows, progress, scores, and finishes.',
            inline: false,
        },
    ]);

    return [welcome, commands, logging, autorole, muterole, leveling, guess, feed];
}

function sectionEmbeds(data) {
    const pages = configInfoEmbeds(data);
    return new Map(CONFIG_SECTIONS.map((section, index) => [section.id, pages[index]]));
}

function embedForSection(data, sectionId) {
    return sectionEmbeds(data).get(sectionId) || null;
}

function homeEmbed() {
    const lines = [
        'Pick a section below to see its current settings.',
        '',
        ...CONFIG_SECTIONS.map((section) => `${section.emoji} **${section.label}** — ${section.blurb}`),
    ];
    return styledEmbed({ title: '⚙️ Server configuration', description: lines.join('\n'), label: 'config' });
}

function buildConfigInfoView(data, selected, { disabled = false } = {}) {
    const pages = sectionEmbeds(data);
    const embed = selected && pages.has(selected) ? pages.get(selected) : homeEmbed();
    const menu = new StringSelectMenuBuilder()
        .setCustomId(SELECT_CUSTOM_ID)
        .setPlaceholder('Choose a section')
        .setDisabled(disabled)
        .addOptions(CONFIG_SECTIONS.map((section) => ({
            label: section.label.slice(0, 25),
            emoji: section.emoji,
            value: section.id,
            description: section.blurb.slice(0, 100),
            default: section.id === selected,
        })));
    const home = new ButtonBuilder()
        .setCustomId(HOME_CUSTOM_ID)
        .setLabel('Home')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(home),
        ],
    };
}

function selectionFrom(component) {
    if (!component) return null;
    if (component.customId === HOME_CUSTOM_ID) return { id: null };
    if (component.customId === SELECT_CUSTOM_ID) return { id: component.values?.[0] ?? null };
    return null;
}

async function presentConfigInfo(interaction, data) {
    let selected = null;
    const replyView = () => buildConfigInfoView(data, selected);
    const message = await replyWithMessage(interaction, {
        ...replyView(),
        allowedMentions: allowedMentions(),
    });
    if (!message || typeof message.createMessageComponentCollector !== 'function') return message;

    const collector = message.createMessageComponentCollector({ time: CONFIG_TIMEOUT_MS });
    collector.on('collect', async (component) => {
        try {
            if (!component.user || component.user.id !== interaction.user.id) {
                await component.reply({ content: ONLY_OWNER, flags: MessageFlags.Ephemeral });
                return;
            }
            const choice = selectionFrom(component);
            if (!choice) return;
            selected = choice.id;
            const view = replyView();
            await component.update({
                embeds: view.embeds,
                components: view.components,
                allowedMentions: allowedMentions(),
            });
        } catch (error) { console.error(redact(error)); }
    });
    collector.on('end', async () => {
        const view = buildConfigInfoView(data, selected, { disabled: true });
        try {
            await interaction.editReply({ embeds: view.embeds, components: view.components });
        } catch (error) {
            // The message can already be gone when the collector ends.
        }
    });
    return message;
}

async function info(interaction, deps = {}) {
    await defer(interaction);
    const readConfig = deps.getGuildConfig || getGuildConfig;
    const data = await readConfig(interaction.guildId);
    if (!data) return finish(interaction, 'No configuration is stored for this server yet.');
    return presentConfigInfo(interaction, data);
}

module.exports = info;
module.exports.configInfoEmbeds = configInfoEmbeds;
module.exports.buildConfigInfoView = buildConfigInfoView;
module.exports.presentConfigInfo = presentConfigInfo;
module.exports.selectionFrom = selectionFrom;
module.exports.embedForSection = embedForSection;
module.exports.CONFIG_SECTIONS = CONFIG_SECTIONS;
module.exports.CONFIG_TIMEOUT_MS = CONFIG_TIMEOUT_MS;
module.exports.ONLY_OWNER = ONLY_OWNER;
module.exports.FOOTER = FOOTER;
