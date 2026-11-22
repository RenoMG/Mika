const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Colors,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');
const { PLACEHOLDER_ICON } = require('../brand');

const LEADERBOARD_LIMIT = 50;
const PAGE_SIZE = 10;
const LEADERBOARD_TIMEOUT_MS = 120000;
const PREV_ID = 'levels:leaderboard:prev';
const NEXT_ID = 'levels:leaderboard:next';
const ONLY_OWNER = 'Only the person who used /leaderboard can use these buttons.';

function rankMark(position) {
    const rank = Math.floor(Number(position));
    if (rank === 1) return '👑';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return String(rank);
}

function memberLabel(entry) {
    if (!entry || entry.departed || !entry.username || entry.username === 'Unknown user') {
        return 'Unknown user (left the server)';
    }
    if (entry.discriminator && entry.discriminator !== '0' && entry.discriminator !== '0000') {
        return `${entry.username}#${entry.discriminator}`;
    }
    return entry.username;
}

function pageCount(entryCount) {
    const count = Math.min(Math.max(0, Math.floor(Number(entryCount)) || 0), LEADERBOARD_LIMIT);
    if (count === 0) return 0;
    return Math.ceil(count / PAGE_SIZE);
}

function leaderboardWindow(rows) {
    const list = Array.isArray(rows) ? rows.filter((entry) => entry && entry.userID) : [];
    return {
        rows: list.slice(0, LEADERBOARD_LIMIT),
        more: list.length > LEADERBOARD_LIMIT,
    };
}

function footerIcon() {
    return process.env.MIKAICON || PLACEHOLDER_ICON;
}

function footerText(shown, more, page, pages) {
    if (!shown) return 'No ranked members yet';
    const pageText = `Page ${page + 1} / ${pages}`;
    if (more) return `Top ${LEADERBOARD_LIMIT} · ${pageText}`;
    const noun = shown === 1 ? 'member' : 'members';
    return `Showing ${shown} ${noun} · ${pageText}`;
}

function entryLine(entry) {
    const level = Math.max(0, Math.floor(Number(entry.level)) || 0);
    const xp = Math.max(0, Math.floor(Number(entry.xp)) || 0);
    return `${rankMark(entry.position)} ${memberLabel(entry)} - Level: ${level} - XP: ${xp}`;
}

function leaderboardButtons(page, pages, disabled) {
    const prev = new ButtonBuilder()
        .setCustomId(PREV_ID)
        .setLabel('Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page <= 0);
    const next = new ButtonBuilder()
        .setCustomId(NEXT_ID)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page >= pages - 1);
    return new ActionRowBuilder().addComponents(prev, next);
}

function buildLeaderboardView({ guildName, entries, more = false, page = 0, disabled = false } = {}) {
    const list = Array.isArray(entries) ? entries.slice(0, LEADERBOARD_LIMIT) : [];
    const title = `Leaderboard for ${guildName || 'this server'}`.slice(0, 256);
    const pages = pageCount(list.length);
    if (!list.length || pages === 0) {
        return {
            embeds: [new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(title)
                .setDescription('Leaderboard is not populated yet.')
                .setFooter({ text: footerText(0, false, 0, 0), iconURL: footerIcon() })
                .setTimestamp()],
            components: [],
        };
    }

    const safePage = Math.min(Math.max(0, page), pages - 1);
    const slice = list.slice(safePage * PAGE_SIZE, (safePage * PAGE_SIZE) + PAGE_SIZE);
    return {
        embeds: [new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(title)
            .setDescription(slice.map(entryLine).join('\n'))
            .setFooter({ text: footerText(list.length, more, safePage, pages), iconURL: footerIcon() })
            .setTimestamp()],
        components: [leaderboardButtons(safePage, pages, disabled)],
    };
}

function applyLeaderboardClick(page, pages, customId) {
    if (pages < 1) return 0;
    if (customId === PREV_ID) return Math.max(0, page - 1);
    if (customId === NEXT_ID) return Math.min(pages - 1, page + 1);
    return page;
}

async function onLeaderboardClick(component, state) {
    if (!component.user || component.user.id !== state.ownerId) {
        await component.reply({ content: ONLY_OWNER, flags: MessageFlags.Ephemeral });
        return state;
    }
    const pages = pageCount(state.entries.length);
    const page = applyLeaderboardClick(state.page, pages, component.customId);
    if (component.customId !== PREV_ID && component.customId !== NEXT_ID) return state;
    const view = buildLeaderboardView({ ...state, page });
    await component.update({ embeds: view.embeds, components: view.components });
    return { ...state, page };
}

module.exports = {
    LEADERBOARD_LIMIT,
    PAGE_SIZE,
    LEADERBOARD_TIMEOUT_MS,
    PREV_ID,
    NEXT_ID,
    ONLY_OWNER,
    rankMark,
    memberLabel,
    pageCount,
    leaderboardWindow,
    buildLeaderboardView,
    applyLeaderboardClick,
    onLeaderboardClick,
};
