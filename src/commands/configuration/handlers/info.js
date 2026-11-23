const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Colors,
    EmbedBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
} = require('discord.js');
const { allowedMentions } = require('../../../utils/mentions');
const { stripIndents } = require('common-tags');
const { getGuildConfig } = require('../../../utils/getGuildConfig');
const { embedValue, listValues, statusText } = require('./configFields');
const {
    DEFAULT_FAREWELL_MESSAGE,
    DEFAULT_GREETING_MESSAGE,
    DEFAULT_LEVEL_MESSAGE,
} = require('../../../utils/formatMessage');

const CONFIG_TIMEOUT_MS = 120000;
const SELECT_CUSTOM_ID = 'configinfo:section';
const HOME_CUSTOM_ID = 'configinfo:home';
const FOOTER = 'Mika | 🖥️ config';
const ONLY_OWNER = 'Only the person who used /config info can use this menu.';

const CONFIG_SECTIONS = [
    { id: 'welcome', label: 'Welcome', blurb: 'Greeting and farewell.' },
    { id: 'commands', label: 'Commands', blurb: 'Which command groups are enabled.' },
    { id: 'logging', label: 'Logging', blurb: 'Log channel and status.' },
    { id: 'autorole', label: 'Auto-role', blurb: 'Role given to new members.' },
    { id: 'muterole', label: 'Mute role', blurb: 'Role used for mutes.' },
    { id: 'leveling', label: 'Leveling', blurb: 'Level-up channel and message.' },
];

function enabledLabel(list) {
    return statusText(list) === 'true' ? '🟢 Enabled' : '🔴 Disabled';
}

function channelValue(list) {
    const ids = listValues(list, 'Channel');
    if (ids.length < 1) return 'No channel set';
    return `**${ids.map((id) => `<#${id}>`).toString().replace(/,/gi, '')}**`;
}

function roleValue(list) {
    const ids = listValues(list, 'Role');
    if (ids.length < 1) return 'No role set';
    return `**${ids.map((id) => `<@&${id}>`).toString().replace(/,/gi, '')}**`;
}

function messageValue(list, empty) {
    const messages = listValues(list, 'Message');
    if (messages.length < 1) return empty;
    return embedValue(messages.toString().replace(/,/gi, ''), empty);
}

function configInfoEmbeds(data) {
    const disabledIds = listValues(data.DisabledChannels, 'Channels');
    const embed1 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Welcome config')
        .addFields(
            { name: 'Greeting status', value: enabledLabel(data.GreetingStatus), inline: true },
            { name: 'Farewell status', value: enabledLabel(data.FarewellStatus), inline: true },
            { name: 'Greeting channel', value: channelValue(data.GreetingChannel), inline: true },
            { name: 'Farewell channel', value: channelValue(data.FarewellChannel), inline: true },
            { name: 'Greeting message', value: messageValue(data.GreetingMessage, `Default: ${DEFAULT_GREETING_MESSAGE}`), inline: true },
            { name: 'Farewell message', value: messageValue(data.FarewellMessage, `Default: ${DEFAULT_FAREWELL_MESSAGE}`), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const embed2 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Command status config')
        .addFields(
            { name: 'Moderation status', value: enabledLabel(data.ModerationCommandStatus), inline: true },
            { name: 'Meme status', value: enabledLabel(data.MemeCommandStatus), inline: true },
            { name: 'Infromation status', value: enabledLabel(data.InfoCommandStatus), inline: true },
            {
                name: 'Restricted channels',
                value: embedValue(stripIndents`${disabledIds.length >= 1 ? `**${disabledIds.map((id) => `• <#${id}>\n`).toString().replace(/,/gi, '')}**` : 'No channels set'}`),
                inline: true,
            },
        )
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const embed3 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Logging status config')
        .addFields(
            { name: 'Logging status', value: enabledLabel(data.LoggingStatus), inline: true },
            { name: 'Logging channel', value: channelValue(data.LoggingChannel), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const embed4 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Auto-role status config')
        .addFields(
            { name: 'Auto-role status', value: enabledLabel(data.AutoroleStatus), inline: true },
            { name: 'Auto-role role', value: roleValue(data.AutoroleRole), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const embed5 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Mute-role status config')
        .addFields({ name: 'Mute-role role', value: roleValue(data.Muterole), inline: true })
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const embed6 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Leveling config')
        .addFields(
            { name: 'Leveling status', value: enabledLabel(data.LevelingCommandStatus), inline: true },
            { name: 'Level up channel', value: channelValue(data.Levelupchannel), inline: true },
            { name: 'Level up message', value: messageValue(data.Levelupmessage, `Default: ${DEFAULT_LEVEL_MESSAGE}`), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    return [embed1, embed2, embed3, embed4, embed5, embed6];
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
        'Pick a section to see the current settings.',
        '',
        ...CONFIG_SECTIONS.map((section) => `**${section.label}** — ${section.blurb}`),
    ];
    return new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription(lines.join('\n'))
        .setTimestamp()
        .setFooter({ text: FOOTER, iconURL: `${process.env.MIKAICON}` });
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
    const response = await interaction.reply({
        ...replyView(),
        allowedMentions: allowedMentions(),
        withResponse: true,
    });
    const message = response?.resource?.message
        ?? (typeof interaction.fetchReply === 'function' ? await interaction.fetchReply() : null);
    if (!message || typeof message.createMessageComponentCollector !== 'function') return response;

    const collector = message.createMessageComponentCollector({ time: CONFIG_TIMEOUT_MS });
    collector.on('collect', async (component) => {
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
    });
    collector.on('end', async () => {
        const view = buildConfigInfoView(data, selected, { disabled: true });
        try {
            await interaction.editReply({ embeds: view.embeds, components: view.components });
        } catch (error) {
            // The message can already be gone when the collector ends.
        }
    });
    return response;
}

async function info(interaction) {
    const data = await getGuildConfig(interaction.guildId);
    if (!data) return interaction.reply('No configuration is stored for this server yet.');
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
