const { redact } = require('../../../utils/redact');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    StringSelectMenuBuilder,
} = require('discord.js');
const { replyWithMessage } = require('../../../utils/ack');
const { allowedMentions } = require('../../../utils/mentions');
const { snowflake } = require('../../../utils/safeId');
const { embed: styledEmbed, footer, timestamp } = require('../../../utils/style');
const { pageButtons } = require('../../../utils/pager');

const SELECT_ID = 'infractions:section';
const HOME_ID = 'infractions:home';
const PREV_ID = 'infractions:prev';
const NEXT_ID = 'infractions:next';
const TIMEOUT_MS = 120000;
const PAGE_SIZE = 5;
const ONLY = 'Only the person who used /infractions can use this menu.';

const SECTIONS = [
    { id: 'overview', label: 'Overview', emoji: '📜', blurb: 'Totals for each type.' },
    { id: 'warns', label: 'Warns', emoji: '⚠️', blurb: 'Reason, moderator, date, and id.', key: 'Warns' },
    { id: 'kicks', label: 'Kicks', emoji: '👢', blurb: 'Reason, moderator, date, and id.', key: 'Kicks' },
    { id: 'mutes', label: 'Mutes', emoji: '🔇', blurb: 'Reason, moderator, date, and id.', key: 'Mutes' },
    { id: 'bans', label: 'Bans', emoji: '🔨', blurb: 'Reason, moderator, date, and id.', key: 'Bans' },
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
    const at = entry && Number(entry.At);
    const date = Number.isFinite(at) && at > 0
        ? timestamp(at, 'D')
        : (entry && entry.Date ? String(entry.Date).slice(0, 64) : 'Unknown date');
    return `**#${id}** · ${date} · by ${moderator}\n> ${reason.replace(/\n/g, '\n> ')}`;
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
    const name = user && (user.globalName || user.username || user.tag) ? String(user.globalName || user.username || user.tag) : 'User';
    const who = user && snowflake(user.id) ? `<@${user.id}>` : `**${name}**`;
    let description;
    let shown = [];
    if (!section.key) {
        description = [
            `Record for ${who}`,
            '',
            ...SECTIONS.filter((item) => item.key).map((item) => `${item.emoji} **${item.label}:** ${records(doc, item.key).length}`),
        ].join('\n');
    } else if (!list.length) {
        description = `${who} has no ${section.label.toLowerCase()}.`;
    } else {
        const start = safePage * PAGE_SIZE;
        shown = list.slice(start, start + PAGE_SIZE);
        const blocks = shown.map((entry, index) => detailBlock(entry, start + index + 1));
        description = `${section.emoji} ${section.label} for ${who}\n\n${blocks.join('\n\n')}`;
    }

    const embed = styledEmbed({ title: `Infractions for ${name}`, description })
        .setFooter(footer('infractions', section.key && list.length > PAGE_SIZE ? `Page ${safePage + 1} of ${pages}` : ''));
    if (user && typeof user.displayAvatarURL === 'function') embed.setThumbnail(user.displayAvatarURL());

    const menu = new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID)
        .setPlaceholder('Choose a section')
        .setDisabled(disabled)
        .addOptions(SECTIONS.map((item) => ({
            label: item.label,
            emoji: item.emoji,
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
        components.push(pageButtons(PREV_ID, NEXT_ID, safePage, pages, disabled));
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
    const message = await replyWithMessage(interaction, payloadOf(first));
    if (!message || typeof message.createMessageComponentCollector !== 'function') return message;

    const collector = message.createMessageComponentCollector({ time: TIMEOUT_MS });
    collector.on('collect', async (component) => {
        try {
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
        } catch (error) { console.error(redact(error)); }
    });
    collector.on('end', async () => {
        const view = buildInfractionsView({ user, doc, selected, page, disabled: true });
        try {
            await interaction.editReply({ embeds: view.embeds, components: view.components });
        } catch (error) {
            // The message can already be gone when the collector ends.
        }
    });
    return message;
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
