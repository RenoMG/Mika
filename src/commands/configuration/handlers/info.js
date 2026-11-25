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
    { id: 'commands', label: 'Commands', emoji: '🧩', blurb: 'Which features are on, and restricted channels.' },
    { id: 'logging', label: 'Logging', emoji: '📑', blurb: 'Log channel and status.' },
    { id: 'autorole', label: 'Auto-role', emoji: '🎭', blurb: 'Role given to new members.' },
    { id: 'muterole', label: 'Mute role', emoji: '🔇', blurb: 'Role used for mutes.' },
    { id: 'leveling', label: 'Leveling', emoji: '🏆', blurb: 'Level-up channel and message.' },
    { id: 'guess', label: 'Guess That Anime', emoji: '🎯', blurb: 'Auto-drop channel and interval.' },
];

function enabledLabel(list) {
    return statusText(list) === 'true' ? '🟢 On' : '🔴 Off';
}

// Command categories run unless turned off, so a missing setting reads as on.
function categoryLabel(list) {
    return statusText(list) === 'false' ? '🔴 Off' : '🟢 On';
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

// "1 hour 30 minutes" instead of "90 minutes".
function intervalText(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const parts = [];
    if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    if (rest) parts.push(`${rest} ${rest === 1 ? 'minute' : 'minutes'}`);
    return parts.join(' ') || `${minutes} minutes`;
}

// Status and channel share one field, so rows line up without blank filler fields.
function statusWithChannel(status, channel) {
    return `${enabledLabel(status)} · ${channelValue(channel)}`;
}

// One builder per section, so a panel only builds the embed it shows.
const SECTION_BUILDERS = {
    welcome: (data) => [
        { name: 'Greeting', value: statusWithChannel(data.GreetingStatus, data.GreetingChannel), inline: true },
        { name: 'Farewell', value: statusWithChannel(data.FarewellStatus, data.FarewellChannel), inline: true },
        { name: 'Greeting message', value: messageValue(data.GreetingMessage, DEFAULT_GREETING_MESSAGE), inline: false },
        { name: 'Farewell message', value: messageValue(data.FarewellMessage, DEFAULT_FAREWELL_MESSAGE), inline: false },
        { name: 'Placeholders', value: TOKENS, inline: false },
    ],
    commands: (data) => {
        const disabledIds = listValues(data.DisabledChannels, 'Channels');
        return [
            { name: 'Moderation', value: categoryLabel(data.ModerationCommandStatus), inline: true },
            { name: 'Anime lookups', value: categoryLabel(data.AnimeCommandStatus), inline: true },
            { name: 'Memes', value: categoryLabel(data.MemeCommandStatus), inline: true },
            { name: 'Guess That Anime', value: categoryLabel(data.GuessCommandStatus), inline: true },
            { name: 'Information', value: categoryLabel(data.InfoCommandStatus), inline: true },
            {
                name: 'Restricted channels',
                value: embedValue(disabledIds.length ? disabledIds.map((id) => `• <#${id}>`).join('\n') : 'None'),
                inline: false,
            },
        ];
    },
    logging: (data) => [
        { name: 'Logging', value: enabledLabel(data.LoggingStatus), inline: true },
        { name: 'Log channel', value: channelValue(data.LoggingChannel), inline: true },
    ],
    autorole: (data) => [
        { name: 'Auto-role', value: enabledLabel(data.AutoroleStatus), inline: true },
        { name: 'Role', value: roleValue(data.AutoroleRole), inline: true },
    ],
    muterole: (data) => [
        { name: 'Mute role', value: roleValue(data.Muterole), inline: true },
    ],
    leveling: (data) => [
        { name: 'Leveling', value: enabledLabel(data.LevelingCommandStatus), inline: true },
        { name: 'Level-up channel', value: listValues(data.Levelupchannel, 'Channel').length ? channelValue(data.Levelupchannel) : 'Same channel as the message', inline: true },
        { name: 'Level-up message', value: messageValue(data.Levelupmessage, DEFAULT_LEVEL_MESSAGE), inline: false },
        { name: 'Placeholders', value: `${TOKENS} · \`{level}\` new level`, inline: false },
    ],
    // Same reading the scheduler uses, so the panel shows the interval that actually runs.
    guess: (data) => [
        { name: 'Auto-drop', value: enabledLabel(data.GuessStatus), inline: true },
        { name: 'Drop channel', value: channelValue(data.GuessChannel), inline: true },
        { name: 'Drop interval', value: `Every **${intervalText(intervalMinutes(data))}**`, inline: true },
    ],
};

function embedForSection(data, sectionId) {
    const build = SECTION_BUILDERS[sectionId];
    return build ? sectionEmbed(sectionId, build(data || {})) : null;
}

function configInfoEmbeds(data) {
    return CONFIG_SECTIONS.map((section) => embedForSection(data, section.id));
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
    const embed = (selected && embedForSection(data, selected)) || homeEmbed();
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
module.exports.intervalText = intervalText;
module.exports.CONFIG_SECTIONS = CONFIG_SECTIONS;
module.exports.CONFIG_TIMEOUT_MS = CONFIG_TIMEOUT_MS;
module.exports.ONLY_OWNER = ONLY_OWNER;
module.exports.FOOTER = FOOTER;
