const {
    MessageFlags,
} = require('discord.js');
const { pageButtons } = require('./pager');

const LEADERBOARD_LIMIT = 50;
const PAGE_SIZE = 10;
const LEADERBOARD_TIMEOUT_MS = 120000;
const PREV_ID = 'levels:leaderboard:prev';
const NEXT_ID = 'levels:leaderboard:next';
const ONLY_OWNER = 'Only the person who used /leaderboard can use these buttons.';

const { rankMark, formatNumber, footer, embed: styledEmbed } = require('./style');

const FORMER_MEMBER = '*Former member*';

// A mention in an embed shows the member's server display name and never pings.
function memberLabel(entry) {
    if (!entry || entry.departed || !entry.username || entry.username === 'Unknown user') {
        return FORMER_MEMBER;
    }
    if (/^\d{17,20}$/.test(String(entry.userID || ''))) return `<@${entry.userID}>`;
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

function footerParts(shown, more, page, pages) {
    if (!shown) return [];
    const count = more ? `Top ${LEADERBOARD_LIMIT}` : `${shown} ${shown === 1 ? 'member' : 'members'}`;
    return [count, pages > 1 ? `Page ${page + 1} of ${pages}` : ''];
}

function entryLine(entry) {
    const level = Math.max(0, Math.floor(Number(entry.level)) || 0);
    const xp = Math.max(0, Math.floor(Number(entry.xp)) || 0);
    return `${rankMark(entry.position)} ${memberLabel(entry)} · Level **${level}** · ${formatNumber(xp)} XP`;
}

function leaderboardButtons(page, pages, disabled) {
    return pageButtons(PREV_ID, NEXT_ID, page, pages, disabled);
}

function buildLeaderboardView({ guildName, entries, more = false, page = 0, disabled = false } = {}) {
    const list = Array.isArray(entries) ? entries.slice(0, LEADERBOARD_LIMIT) : [];
    const title = `🏆 ${guildName || 'This server'} leaderboard`.slice(0, 256);
    const pages = pageCount(list.length);
    if (!list.length || pages === 0) {
        return {
            embeds: [styledEmbed({
                title,
                description: 'Nobody has earned XP yet. Start chatting to get on the board!',
                label: 'leaderboard',
            })],
            components: [],
        };
    }

    const safePage = Math.min(Math.max(0, page), pages - 1);
    const slice = list.slice(safePage * PAGE_SIZE, (safePage * PAGE_SIZE) + PAGE_SIZE);
    return {
        embeds: [styledEmbed({ title, description: slice.map(entryLine).join('\n') })
            .setFooter(footer('leaderboard', ...footerParts(list.length, more, safePage, pages)))],
        components: pages > 1 ? [leaderboardButtons(safePage, pages, disabled)] : [],
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
