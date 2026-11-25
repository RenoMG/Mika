const { MessageFlags } = require('discord.js');
const { deferComponent, updateComponent } = require('../utils/ack');
const { memberLabel } = require('../utils/leaderboard');
const { embed: styledEmbed, footer, formatNumber, rankMark } = require('../utils/style');
const { allowedMentions } = require('../utils/mentions');
const {
    GUESS_BOARD_LIMIT,
    GUESS_BOARD_TIMEOUT_MS,
    GUESS_PAGE_SIZE,
} = require('./constants');
const { pageButtons } = require('../utils/pager');
const { titleBadge } = require('./season');

const PREV_ID = 'guess:board:prev';
const NEXT_ID = 'guess:board:next';
const ONLY_OWNER = 'Only the person who used /guess leaderboard can use these buttons.';

function pageCount(entryCount) {
    const count = Math.min(Math.max(0, Math.floor(Number(entryCount)) || 0), GUESS_BOARD_LIMIT);
    if (!count) return 0;
    return Math.ceil(count / GUESS_PAGE_SIZE);
}

function footerParts(shown, page, pages) {
    if (!shown) return [];
    return [`${shown} ${shown === 1 ? 'player' : 'players'}`, pages > 1 ? `Page ${page + 1} of ${pages}` : ''];
}

function entryLine(entry) {
    const wins = Math.max(0, Math.floor(Number(entry.wins)) || 0);
    const badge = titleBadge(entry.titles);
    return `${rankMark(entry.position)} ${memberLabel(entry)}${badge ? ` ${badge}` : ''} · **${formatNumber(wins)}** ${wins === 1 ? 'win' : 'wins'}`;
}

function boardButtons(page, pages, disabled) {
    return pageButtons(PREV_ID, NEXT_ID, page, pages, disabled);
}

function buildGuessBoard({ guildName, entries, page = 0, disabled = false, period = '', note = '' } = {}) {
    const list = Array.isArray(entries) ? entries.slice(0, GUESS_BOARD_LIMIT) : [];
    const title = `🎯 ${guildName || 'This server'} guess leaderboard${period ? ` · ${period}` : ''}`.slice(0, 256);
    const pages = pageCount(list.length);
    if (!list.length || !pages) {
        return {
            embeds: [styledEmbed({
                title,
                description: [period && period !== 'All time' ? 'Nobody has won a round this season yet. Start one with /guess play!'
                    : 'Nobody has guessed correctly yet. Start a round with /guess play!', note].filter(Boolean).join('\n\n'),
                label: 'guess',
            })],
            components: [],
            allowedMentions: allowedMentions(),
        };
    }
    const safePage = Math.min(Math.max(0, page), pages - 1);
    const slice = list.slice(safePage * GUESS_PAGE_SIZE, (safePage * GUESS_PAGE_SIZE) + GUESS_PAGE_SIZE);
    return {
        embeds: [styledEmbed({ title, description: [slice.map(entryLine).join('\n'), note ? `-# ${note}` : ''].filter(Boolean).join('\n\n') })
            .setFooter(footer('guess', ...footerParts(list.length, safePage, pages)))],
        components: pages > 1 ? [boardButtons(safePage, pages, disabled)] : [],
        allowedMentions: allowedMentions(),
    };
}

function applyBoardClick(page, pages, customId) {
    if (pages < 1) return 0;
    if (customId === PREV_ID) return Math.max(0, page - 1);
    if (customId === NEXT_ID) return Math.min(pages - 1, page + 1);
    return page;
}

async function onBoardClick(component, state) {
    if (!component.user || component.user.id !== state.ownerId) {
        await component.reply({
            content: ONLY_OWNER,
            flags: MessageFlags.Ephemeral,
            allowedMentions: allowedMentions(),
        });
        return state;
    }
    const pages = pageCount(state.entries.length);
    if (component.customId !== PREV_ID && component.customId !== NEXT_ID) return state;
    await deferComponent(component);
    if (state.loading) return state;
    state.loading = true;
    try {
        const page = applyBoardClick(state.page, pages, component.customId);
        const entries = state.loadPage ? await state.loadPage(state.entries, page) : state.entries;
        const view = buildGuessBoard({ ...state, entries, page, disabled: Boolean(state.closed) });
        await updateComponent(component, {
            embeds: view.embeds,
            components: view.components,
            allowedMentions: allowedMentions(),
        });
        return { ...state, entries, page, loading: false };
    } finally { state.loading = false; }
}

function rowsFrom(docs, lookup) {
    const rows = [];
    for (const doc of docs || []) {
        if (!doc || !doc.userID) continue;
        const user = typeof lookup === 'function' ? lookup(doc.userID) : null;
        if (user && (user.bot === true || user.system === true)) continue;
        rows.push({
            userID: String(doc.userID),
            wins: Math.max(0, Math.floor(Number(doc.wins)) || 0),
            username: user && user.username ? user.username : 'Unknown user',
            departed: !user || !user.username,
            titles: Array.isArray(doc.titles) ? doc.titles : [],
        });
    }
    return orderRows(rows);
}

function orderRows(rows) {
    return (Array.isArray(rows) ? rows : [])
        .filter((row) => row && row.userID && Number(row.wins) > 0)
        .map((row) => ({
            userID: String(row.userID),
            username: row.username || 'Unknown user',
            wins: Math.max(0, Math.floor(Number(row.wins)) || 0),
            crystals: Math.max(0, Math.floor(Number(row.crystals)) || 0),
            departed: Boolean(row.departed),
            titles: Array.isArray(row.titles) ? row.titles : [],
        }))
        .sort((left, right) => right.wins - left.wins || left.userID.localeCompare(right.userID))
        .slice(0, GUESS_BOARD_LIMIT)
        .map((row, index) => ({ ...row, position: index + 1 }));
}

module.exports = {
    PREV_ID,
    NEXT_ID,
    ONLY_OWNER,
    pageCount,
    buildGuessBoard,
    applyBoardClick,
    onBoardClick,
    orderRows,
    rowsFrom,
    GUESS_BOARD_TIMEOUT_MS,
};
