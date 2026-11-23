const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Colors,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');
const { PLACEHOLDER_ICON } = require('../brand');
const { rankMark } = require('../utils/leaderboard');
const { allowedMentions } = require('../utils/mentions');
const {
    GUESS_BOARD_LIMIT,
    GUESS_BOARD_TIMEOUT_MS,
    GUESS_PAGE_SIZE,
} = require('./constants');

const PREV_ID = 'guess:board:prev';
const NEXT_ID = 'guess:board:next';
const ONLY_OWNER = 'Only the person who used /guess leaderboard can use these buttons.';

function pageCount(entryCount) {
    const count = Math.min(Math.max(0, Math.floor(Number(entryCount)) || 0), GUESS_BOARD_LIMIT);
    if (!count) return 0;
    return Math.ceil(count / GUESS_PAGE_SIZE);
}

function memberLabel(entry) {
    if (!entry || entry.departed || !entry.username || entry.username === 'Unknown user') {
        return 'Unknown user (left the server)';
    }
    return entry.username;
}

function footerIcon() {
    return process.env.MIKAICON || PLACEHOLDER_ICON;
}

function footerText(shown, page, pages) {
    if (!shown) return 'No correct guesses yet';
    const noun = shown === 1 ? 'player' : 'players';
    return `Showing ${shown} ${noun} · Page ${page + 1} / ${pages}`;
}

function entryLine(entry) {
    const wins = Math.max(0, Math.floor(Number(entry.wins)) || 0);
    return `${rankMark(entry.position)} ${memberLabel(entry)} - Wins: ${wins}`;
}

function boardButtons(page, pages, disabled) {
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

function buildGuessBoard({ guildName, entries, page = 0, disabled = false } = {}) {
    const list = Array.isArray(entries) ? entries.slice(0, GUESS_BOARD_LIMIT) : [];
    const title = `Guess leaderboard for ${guildName || 'this server'}`.slice(0, 256);
    const pages = pageCount(list.length);
    if (!list.length || !pages) {
        return {
            embeds: [new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(title)
                .setDescription('Nobody has guessed correctly yet.')
                .setFooter({ text: footerText(0, 0, 0), iconURL: footerIcon() })
                .setTimestamp()],
            components: [],
            allowedMentions: allowedMentions(),
        };
    }
    const safePage = Math.min(Math.max(0, page), pages - 1);
    const slice = list.slice(safePage * GUESS_PAGE_SIZE, (safePage * GUESS_PAGE_SIZE) + GUESS_PAGE_SIZE);
    return {
        embeds: [new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(title)
            .setDescription(slice.map(entryLine).join('\n'))
            .setFooter({ text: footerText(list.length, safePage, pages), iconURL: footerIcon() })
            .setTimestamp()],
        components: [boardButtons(safePage, pages, disabled)],
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
    const page = applyBoardClick(state.page, pages, component.customId);
    const view = buildGuessBoard({ ...state, page });
    await component.update({
        embeds: view.embeds,
        components: view.components,
        allowedMentions: allowedMentions(),
    });
    return { ...state, page };
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
