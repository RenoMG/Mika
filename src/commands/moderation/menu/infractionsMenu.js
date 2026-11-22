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
const { snowflake } = require('../../../utils/safeId');

const SELECT_ID = 'infractions:section';
const HOME_ID = 'infractions:home';
const PREV_ID = 'infractions:prev';
const NEXT_ID = 'infractions:next';
const TIMEOUT_MS = 120000;
const PAGE_SIZE = 5;
const ONLY = 'Only the person who used /infractions can use this menu.';
const FOOTER = 'Mika | 📜 infractions';

const SECTIONS = [
    { id: 'overview', label: 'Overview', blurb: 'Totals for each type.' },
    { id: 'warns', label: 'Warns', blurb: 'Reason, moderator, date, and id.', key: 'Warns' },
    { id: 'kicks', label: 'Kicks', blurb: 'Reason, moderator, date, and id.', key: 'Kicks' },
    { id: 'mutes', label: 'Mutes', blurb: 'Reason, moderator, date, and id.', key: 'Mutes' },
    { id: 'bans', label: 'Bans', blurb: 'Reason, moderator, date, and id.', key: 'Bans' },
];

function records(doc, key) {
    if (!doc || !key || !Array.isArray(doc[key])) return [];
    return doc[key];
}

function pageCount(length) {
    if (!length) return 1;
    return Math.ceil(length / PAGE_SIZE);
}

function detailBlock(entry, id) {
    const reason = String(entry && entry.Reason ? entry.Reason : 'No reason').slice(0, 300);
    const moderatorId = entry && snowflake(entry.ExecuterID);
    const moderator = moderatorId ? `<@${moderatorId}>` : 'unknown';
    const date = entry && entry.Date ? String(entry.Date).slice(0, 64) : 'unknown';
    return `**ID ${id}**\nReason: ${reason}\nModerator: ${moderator}\nDate: ${date}`;
}

function mentionIds(entries) {
    const ids = [];
    for (const entry of entries) {
        const id = entry && snowflake(entry.ExecuterID);
        if (id) ids.push(id);
    }
    return ids;
}

function sectionById(id) {
    return SECTIONS.find((section) => section.id === id) || SECTIONS[0];
}

function buildInfractionsView({ user, doc, selected = 'overview', page = 0, disabled = false }) {
    const section = sectionById(selected);
    const list = records(doc, section.key);
    const pages = section.key ? pageCount(list.length) : 1;
    const safePage = Math.min(Math.max(0, page), pages - 1);
    const name = user && (user.username || user.tag) ? String(user.username || user.tag) : 'User';
    let description;
    let shown = [];
    if (!section.key) {
        description = [
            `**${name}**`,
            '',
            `**Warns** ${records(doc, 'Warns').length}`,
            `**Kicks** ${records(doc, 'Kicks').length}`,
            `**Mutes** ${records(doc, 'Mutes').length}`,
            `**Bans** ${records(doc, 'Bans').length}`,
        ].join('\n');
    } else if (!list.length) {
        description = `**${name}** has no ${section.label.toLowerCase()}.`;
    } else {
        const start = safePage * PAGE_SIZE;
        shown = list.slice(start, start + PAGE_SIZE);
        const blocks = shown.map((entry, index) => detailBlock(entry, start + index + 1));
        description = `**${name}** — ${section.label}\n\n${blocks.join('\n\n')}`;
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Infractions')
        .setDescription(description.slice(0, 4096))
        .setFooter({
            text: section.key && list.length > PAGE_SIZE
                ? `${FOOTER} · Page ${safePage + 1} / ${pages}`
                : FOOTER,
            iconURL: process.env.MIKAICON,
        })
        .setTimestamp();

    const menu = new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID)
        .setPlaceholder('Choose a section')
        .setDisabled(disabled)
        .addOptions(SECTIONS.map((item) => ({
            label: item.label,
            value: item.id,
            description: item.blurb.slice(0, 100),
            default: item.id === section.id,
        })));
    const home = new ButtonBuilder()
        .setCustomId(HOME_ID)
        .setLabel('Home')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    const components = [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(home),
    ];
    if (section.key && list.length > PAGE_SIZE) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(PREV_ID)
                .setLabel('Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || safePage <= 0),
            new ButtonBuilder()
                .setCustomId(NEXT_ID)
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || safePage >= pages - 1),
        ));
    }

    return {
        embeds: [embed],
        components,
        allowedMentions: allowedMentions(...mentionIds(shown), user && user.id),
        page: safePage,
    };
}

function selectionFrom(component) {
    if (!component) return null;
    if (component.customId === HOME_ID) return { id: 'overview', page: 'reset' };
    if (component.customId === SELECT_ID) return { id: component.values?.[0] || 'overview', page: 'reset' };
    if (component.customId === PREV_ID) return { page: -1 };
    if (component.customId === NEXT_ID) return { page: 1 };
    return null;
}

function payloadOf(view) {
    return {
        embeds: view.embeds,
        components: view.components,
        allowedMentions: view.allowedMentions,
    };
}

async function presentInfractions(interaction, { user, doc }) {
    let selected = 'overview';
    let page = 0;
    const replyView = () => buildInfractionsView({ user, doc, selected, page });
    const first = replyView();
    page = first.page;
    const response = await interaction.reply({
        ...payloadOf(first),
        withResponse: true,
    });
    const message = response?.resource?.message
        ?? (typeof interaction.fetchReply === 'function' ? await interaction.fetchReply() : null);
    if (!message || typeof message.createMessageComponentCollector !== 'function') return response;

    const collector = message.createMessageComponentCollector({ time: TIMEOUT_MS });
    collector.on('collect', async (component) => {
        if (!component.user || component.user.id !== interaction.user.id) {
            await component.reply({ content: ONLY, flags: MessageFlags.Ephemeral });
            return;
        }
        const choice = selectionFrom(component);
        if (!choice) return;
        if (choice.page === 'reset') {
            selected = choice.id;
            page = 0;
        } else if (choice.page) {
            page += choice.page;
        }
        const view = replyView();
        page = view.page;
        await component.update(payloadOf(view));
    });
    collector.on('end', async () => {
        const view = buildInfractionsView({ user, doc, selected, page, disabled: true });
        try {
            await interaction.editReply({ embeds: view.embeds, components: view.components });
        } catch (error) {
            // The message can already be gone when the collector ends.
        }
    });
    return response;
}

module.exports = {
    SELECT_ID,
    HOME_ID,
    PREV_ID,
    NEXT_ID,
    TIMEOUT_MS,
    PAGE_SIZE,
    ONLY,
    SECTIONS,
    buildInfractionsView,
    selectionFrom,
    presentInfractions,
};
