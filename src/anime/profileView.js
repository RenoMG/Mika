const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { allowedMentions } = require('../utils/mentions');
const { embed: styledEmbed, formatNumber } = require('../utils/style');
const { SITES } = require('./linkedProfiles');
const { neutralize } = require('./text');

const SWITCH_PREFIX = 'profile:site:';

function spacer() {
    return { name: '​', value: '​', inline: true };
}

function scoreText(score) {
    if (!Number.isFinite(score) || score <= 0) return '';
    return Number.isInteger(score) ? `${score}` : score.toFixed(1);
}

function quoteBlock(value) {
    const text = neutralize(value, 300);
    if (!text) return '';
    return `> ${text}`;
}

function lines(list, render, empty = 'Nothing yet') {
    const rows = (list || []).map(render).filter(Boolean);
    return (rows.length ? rows.join('\n') : empty).slice(0, 1024);
}

function watchingLine(item) {
    const progress = item.episodes ? `${item.progress}/${item.episodes}` : (item.progress ? `ep ${item.progress}` : '');
    const mark = item.rewatch ? '🔁 ' : '';
    return `• ${mark}${neutralize(item.title, 80)}${progress ? ` · ${progress}` : ''}`;
}

function completedLine(item) {
    const score = scoreText(item.score);
    return `• ${neutralize(item.title, 80)}${score ? ` · ★${score}` : ''}`;
}

function statsValue(stats) {
    const parts = [];
    if (stats.count) parts.push(`${formatNumber(stats.count)} anime`);
    if (stats.episodes) parts.push(`${formatNumber(stats.episodes)} eps`);
    if (stats.days >= 0.1) parts.push(`${stats.days.toFixed(1)} days`);
    if (stats.meanScore) parts.push(`★${scoreText(stats.meanScore)} avg`);
    const statusBits = [];
    const s = stats.statuses || {};
    if (s.watching) statusBits.push(`📺 ${formatNumber(s.watching)}`);
    if (s.completed) statusBits.push(`✅ ${formatNumber(s.completed)}`);
    if (s.planning) statusBits.push(`🗓️ ${formatNumber(s.planning)}`);
    if (s.paused) statusBits.push(`⏸️ ${formatNumber(s.paused)}`);
    if (s.dropped) statusBits.push(`🗑️ ${formatNumber(s.dropped)}`);
    const out = [parts.join(' · '), statusBits.join(' ')].filter(Boolean).join('\n');
    return (out || 'Nothing yet').slice(0, 1024);
}

function joined(list) {
    return (list || []).map((name) => neutralize(name, 60)).filter(Boolean).join(', ').slice(0, 1024);
}

// Same layout as before: bio quote, then three rows of three. Rows with
// nothing to show are left out rather than filled with "Nothing yet".
function profileEmbed(profile, user, { cached = false } = {}) {
    const info = SITES[profile.site];
    const person = neutralize(user && (user.globalName || user.username), 64) || 'Anime';
    const name = neutralize(profile.name, 32);
    const embed = styledEmbed({
        title: `${person}'s anime profile`,
        url: profile.url,
        description: [quoteBlock(profile.about), `🔗 **${info.label}:** ${name}`].filter(Boolean).join('\n\n'),
        label: 'profile',
        extra: [cached ? `Via ${info.label} (cached)` : `Via ${info.label}`],
    }).addFields(
        { name: '📺 Watching', value: lines(profile.watching, watchingLine), inline: true },
        { name: '⭐ Favorites', value: lines(profile.favorites.anime, (title, index) => `${index + 1}. ${neutralize(title, 80)}`), inline: true },
        { name: '✅ Recently completed', value: lines(profile.completed, completedLine), inline: true },
        { name: '📊 Stats', value: statsValue(profile.stats), inline: true },
        { name: '🎭 Top genres', value: joined(profile.genres.map(([genre]) => genre)) || '—', inline: true },
        { name: '🧑 Characters', value: joined(profile.favorites.characters) || '—', inline: true },
    );
    const extras = [
        ['🎬 Staff', joined(profile.favorites.staff)],
        ['🏢 Studios', joined(profile.favorites.studios)],
    ].filter(([, value]) => value);
    if (extras.length) {
        for (const [label, value] of extras) embed.addFields({ name: label, value, inline: true });
        for (let index = extras.length; index < 3; index += 1) embed.addFields(spacer());
    }
    const thumb = profile.avatar || (user && typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL() : null);
    if (thumb) embed.setThumbnail(thumb);
    return embed;
}

function switchRow(sites, current, disabled = false) {
    if (!Array.isArray(sites) || sites.length < 2) return [];
    return [new ActionRowBuilder().addComponents(...sites.map((site) => new ButtonBuilder()
        .setCustomId(`${SWITCH_PREFIX}${site}`)
        .setLabel(SITES[site].label)
        .setStyle(site === current ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(disabled || site === current)))];
}

function profilePayload(profile, user, { sites = [], cached = false, disabled = false } = {}) {
    return {
        embeds: [profileEmbed(profile, user, { cached })],
        components: switchRow(sites, profile.site, disabled),
        allowedMentions: allowedMentions(),
    };
}

module.exports = { SWITCH_PREFIX, profileEmbed, profilePayload, switchRow };
