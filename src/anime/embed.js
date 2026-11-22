const { Colors, EmbedBuilder } = require('discord.js');
const { PLACEHOLDER_ICON } = require('../brand');
const { neutralize } = require('./text');

const STATUS = {
    FINISHED: 'Finished',
    RELEASING: 'Releasing',
    NOT_YET_RELEASED: 'Not yet released',
    CANCELLED: 'Cancelled',
    HIATUS: 'Hiatus',
    finished: 'Finished',
    current: 'Releasing',
    upcoming: 'Not yet released',
    tba: 'Not yet released',
    unreleased: 'Not yet released',
};

function displayTitle(media) {
    const titles = media && media.titles ? media.titles : {};
    return titles.english || titles.romaji || titles.native || (media && media.synonyms && media.synonyms[0]) || 'Anime';
}

function footer(text) {
    return { text: String(text).slice(0, 2048), iconURL: process.env.MIKAICON || PLACEHOLDER_ICON };
}

function clip(value, max) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatDate(date) {
    if (!date || !date.year) return '';
    const month = date.month ? String(date.month).padStart(2, '0') : '';
    const day = date.day ? String(date.day).padStart(2, '0') : '';
    if (month && day) return `${date.year}-${month}-${day}`;
    if (month) return `${date.year}-${month}`;
    return String(date.year);
}

function field(name, value) {
    const text = clip(value || '—', 1024) || '—';
    return { name, value: text, inline: true };
}

function animeEmbed(media) {
    const source = media && media.source === 'Kitsu' ? 'Kitsu' : 'AniList';
    const url = media && media.url ? String(media.url) : (source === 'Kitsu' ? 'https://kitsu.app' : 'https://anilist.co');
    const title = neutralize(displayTitle(media), 256) || 'Anime';
    const also = [];
    const titles = media && media.titles ? media.titles : {};
    for (const name of [titles.romaji, titles.english, titles.native]) {
        const clean = neutralize(name, 200);
        if (clean && clean !== title && !also.includes(clean)) also.push(clean);
    }
    const aired = [formatDate(media && media.startDate), formatDate(media && media.endDate)].filter(Boolean).join(' – ');
    const synopsis = clip(media && media.synopsis, 500) || 'No synopsis.';
    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(title)
        .setURL(url)
        .setDescription(synopsis)
        .addFields(
            field('Score', media && media.score != null ? `${media.score}/100` : '—'),
            field('Episodes', media && media.episodes != null ? String(media.episodes) : '—'),
            field('Status', (media && STATUS[media.status]) || '—'),
            { name: 'Genres', value: clip((media && media.genres || []).map((name) => neutralize(name, 40)).filter(Boolean).join(', '), 1024) || '—', inline: false },
            { name: 'Tags', value: clip((media && media.tags || []).map((name) => neutralize(name, 40)).filter(Boolean).join(', '), 1024) || '—', inline: false },
            field('Studios', (media && media.studios || []).map((name) => neutralize(name, 80)).filter(Boolean).join(', ')),
            field('Aired', aired),
        )
        .setFooter(footer(`Via ${source} · ${url}`))
        .setTimestamp();
    if (also.length) embed.addFields({ name: 'Also known as', value: clip(also.join('\n'), 1024), inline: false });
    const cover = media && media.cover;
    if (typeof cover === 'string' && /^https?:\/\//i.test(cover)) embed.setImage(cover);
    return embed;
}

module.exports = {
    displayTitle,
    animeEmbed,
    footer,
};
