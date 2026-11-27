// One release as a Discord message: the editable line above (with the
// optional role ping), then an embed with the show, the episode, its pictures,
// the studio and next episode, and buttons to AniList and the streaming sites.
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    escapeMarkdown,
} = require('discord.js');
const { formatMessage } = require('../utils/formatMessage');
const { excerptOf } = require('../blog/post');

const RELEASE_COLOR = 0x02A9FF;
const CONTENT_MAX = 2000;
const MAX_STREAM_BUTTONS = 4;

function shorten(text, max) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function safeUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch (error) {
        return null;
    }
}

// LiveChart titles end in "#5"; AniList items carry the number.
function episodeOf(item) {
    if (Number.isInteger(item.episode)) return { title: item.title, from: item.episode, to: item.episodeTo || item.episode };
    const match = /^(.*?)\s*(?:#|Episode\s+|Ep\.?\s*)(\d{1,5})\s*$/i.exec(String(item.title || ''));
    if (match) return { title: match[1] || item.title, from: Number(match[2]), to: Number(match[2]) };
    return { title: item.title, from: null, to: null };
}

function episodeText({ from, to }, format = '') {
    if (format === 'MOVIE') return 'The movie';
    if (from == null) return 'A new episode';
    return to > from ? `Episodes ${from}–${to}` : `Episode ${from}`;
}

// What kind of release this is, from the episode itself, whichever entry it came through.
function kindOf(item) {
    const { from, to } = episodeOf(item);
    if (item.format === 'MOVIE') return { emoji: '🎬', label: 'Movie release' };
    if (from === 1) return { emoji: '🆕', label: to > 1 ? 'New series, all at once' : 'Series premiere' };
    if (Number.isInteger(item.episodes) && item.episodes > 1 && to === item.episodes) return { emoji: '🏁', label: 'Season finale' };
    return { emoji: '📺', label: 'New episode' };
}

function releaseEmbed(source, feed, item) {
    const kind = kindOf(item);
    const episode = episodeOf(item);
    const embed = new EmbedBuilder().setColor(item.color || source.color || RELEASE_COLOR);
    embed.setAuthor({ name: `${kind.emoji} ${kind.label}`.slice(0, 256) });
    embed.setTitle(shorten(`${episode.title} — ${episodeText(episode, item.format)}`, 256));
    const link = safeUrl(item.link);
    if (link) embed.setURL(link);

    const lines = [];
    const other = [item.romaji, item.native].filter((name) => name && name !== episode.title);
    if (other.length) lines.push(`*${escapeMarkdown(shorten(other.join(' · '), 200))}*`);
    if (item.genres && item.genres.length) lines.push(item.genres.map(escapeMarkdown).join(' · '));
    if (!Number.isInteger(item.episode)) {
        const excerpt = excerptOf(item);
        if (excerpt) lines.push(escapeMarkdown(excerpt));
    }
    if (lines.length) embed.setDescription(lines.join('\n').slice(0, 4096));

    const fields = [];
    if (episode.from != null && Number.isInteger(item.episode)) {
        const range = episode.to > episode.from ? `${episode.from}–${episode.to}` : String(episode.from);
        fields.push({ name: 'Episode', value: item.episodes ? `${range} / ${item.episodes}` : range, inline: true });
    }
    if (item.studio) fields.push({ name: 'Studio', value: escapeMarkdown(shorten(item.studio, 100)), inline: true });
    if (item.nextEpisode && item.nextEpisode.at) {
        const at = Math.floor(item.nextEpisode.at.getTime() / 1000);
        fields.push({ name: 'Next episode', value: `Ep ${item.nextEpisode.episode} <t:${at}:R>`, inline: true });
    } else if (Number.isInteger(item.episode) && kind.label === 'Season finale') {
        fields.push({ name: 'Next episode', value: 'That\'s the last one!', inline: true });
    }
    if (fields.length) embed.addFields(fields);

    const cover = safeUrl(item.cover);
    if (cover) embed.setThumbnail(cover);
    const image = safeUrl(item.image);
    if (image) embed.setImage(image);
    embed.setFooter({ text: Number.isInteger(item.episode) ? `Aired in Japan · ${source.name} · AniList` : source.name });
    if (item.published) embed.setTimestamp(item.published);
    return embed;
}

function releaseButtons(source, item) {
    const buttons = [];
    const link = safeUrl(item.link);
    if (link) {
        const site = Number.isInteger(item.episode) ? 'AniList' : source.name.replace(/ episodes$/i, '');
        buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel(`View on ${site}`.slice(0, 80)).setEmoji('📖'));
    }
    const sites = new Set();
    for (const stream of item.streams || []) {
        if (buttons.length > MAX_STREAM_BUTTONS) break;
        const url = safeUrl(stream.url);
        if (!url || sites.has(stream.site)) continue;
        sites.add(stream.site);
        buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(`Watch on ${stream.site}`.slice(0, 80)).setEmoji('▶️'));
    }
    return buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
}

// Placeholder values for the line above the embed.
function messageValues(source, item) {
    const episode = episodeOf(item);
    const link = safeUrl(item.link);
    return {
        title: escapeMarkdown(shorten(episode.title || 'Anime', 200)),
        episode: episodeText(episode, item.format),
        type: kindOf(item).label,
        link: link ? `<${link}>` : '',
        source: escapeMarkdown(source.name),
    };
}

function releaseMessage(source, feed, item, { template, roleId = null } = {}) {
    const line = formatMessage(template, messageValues(source, item)).trim();
    const content = [roleId ? `<@&${roleId}>` : null, line].filter(Boolean).join(' ').slice(0, CONTENT_MAX);
    return {
        ...(content ? { content } : {}),
        embeds: [releaseEmbed(source, feed, item)],
        components: releaseButtons(source, item),
        allowedMentions: { parse: [], users: [], roles: roleId ? [roleId] : [], repliedUser: false },
    };
}

module.exports = {
    RELEASE_COLOR,
    episodeOf,
    kindOf,
    messageValues,
    releaseEmbed,
    releaseMessage,
};
