// One look for every embed Mika sends: the same colors, footer shape, title
// case, separator, number format, and dates that render in the viewer's own
// timezone.
const { Colors, EmbedBuilder } = require('discord.js');
const { PLACEHOLDER_ICON } = require('../brand');

const COLORS = Object.freeze({
    primary: Colors.Blue,
    success: Colors.Green,
    warning: Colors.Yellow,
    danger: Colors.Red,
});

const SEP = ' · ';

// Footer labels by area. Each one is "emoji Label" in title case.
const LABELS = Object.freeze({
    anime: '🎌 Anime',
    profile: '🎌 Anime profile',
    watching: '🎌 Watching',
    completed: '🎌 Completed',
    meme: '😂 Meme',
    guess: '🎯 Guess',
    levels: '🏆 Levels',
    leaderboard: '🏆 Leaderboard',
    about: '🌸 About',
    avatar: '🖼️ Avatar',
    server: '📋 Server info',
    user: '🔎 User info',
    status: '💾 Status',
    ban: '🔨 Ban',
    kick: '👢 Kick',
    mute: '🔇 Mute',
    warn: '⚠️ Warn',
    infractions: '📜 Infractions',
    clear: '🧹 Clear',
    logs: '📑 Logs',
    config: '⚙️ Config',
    help: '❓ Help',
});

function footerIcon() {
    return process.env.MIKAICON || PLACEHOLDER_ICON;
}

function footerText(label, ...extra) {
    const name = LABELS[label] || label;
    return ['Mika', name, ...extra].filter((part) => part != null && String(part).trim()).join(SEP).slice(0, 2048);
}

function footer(label, ...extra) {
    return { text: footerText(label, ...extra), iconURL: footerIcon() };
}

function embed({ color = 'primary', title, description, label, extra = [], url } = {}) {
    const built = new EmbedBuilder()
        .setColor(COLORS[color] ?? color)
        .setTimestamp();
    if (title) built.setTitle(String(title).slice(0, 256));
    if (url) built.setURL(url);
    if (description) built.setDescription(String(description).slice(0, 4096));
    if (label) built.setFooter(footer(label, ...extra));
    return built;
}

function formatNumber(value) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return '0';
    return number.toLocaleString('en-US');
}

function plural(count, one, many = `${one}s`) {
    return `${formatNumber(count)} ${Number(count) === 1 ? one : many}`;
}

// Discord renders <t:...> in each viewer's own timezone and language.
function timestamp(value, style = 'D') {
    const date = value instanceof Date ? value : new Date(value);
    const ms = date.getTime();
    if (!Number.isFinite(ms)) return '';
    return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

// Rank 1-3 get medals; the rest get a code-styled number so the names line up.
function rankMark(position) {
    const rank = Math.floor(Number(position));
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `\`#${rank}\``;
}

module.exports = {
    COLORS,
    SEP,
    LABELS,
    footerIcon,
    footerText,
    footer,
    embed,
    formatNumber,
    plural,
    timestamp,
    rankMark,
};
