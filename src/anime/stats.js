const { cleanScore, formatLabel, scoreText } = require('./details');
const { STATUSES, readAll } = require('./library');
const { embed: styledEmbed, formatNumber } = require('../utils/style');
const { neutralize } = require('./text');

// Episode length when a row has none saved: a typical TV episode.
const DEFAULT_DURATION = 24;

// Episodes watched for one row. A finished show counts every episode once per
// watch; anything else counts its saved progress.
function watchedEpisodes(item, statusId) {
    const episodes = Number(item && item.episodes) || 0;
    const progress = Number(item && item.progress) || 0;
    const rewatches = Number(item && item.rewatches) || 0;
    if (statusId === 'completed') return (episodes || progress) * (1 + rewatches);
    // A rewatch in progress was watched in full at least once before.
    if (statusId === 'rewatching') return (episodes * (1 + rewatches)) + progress;
    return progress;
}

function computeStats(profile) {
    const lists = readAll(profile);
    const counts = {};
    let total = 0;
    let episodes = 0;
    let minutes = 0;
    let scored = 0;
    let scoreSum = 0;
    const distribution = new Array(10).fill(0);
    const genres = new Map();
    const formats = new Map();
    for (const status of STATUSES) {
        const list = lists[status.id];
        counts[status.id] = list.length;
        total += list.length;
        for (const item of list) {
            const eps = watchedEpisodes(item, status.id);
            episodes += eps;
            minutes += eps * (Number(item.duration) || DEFAULT_DURATION);
            const score = cleanScore(item.score);
            if (score) {
                scored += 1;
                scoreSum += score;
                distribution[Math.min(9, Math.max(0, Math.ceil(score) - 1))] += 1;
            }
            if (status.id !== 'planning') {
                for (const genre of Array.isArray(item.genres) ? item.genres : []) {
                    genres.set(genre, (genres.get(genre) || 0) + 1);
                }
                const format = formatLabel(item.format);
                if (format) formats.set(format, (formats.get(format) || 0) + 1);
            }
        }
    }
    const top = (map, count) => [...map.entries()]
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
        .slice(0, count);
    return {
        counts,
        total,
        episodes,
        minutes,
        days: minutes / 1440,
        scored,
        meanScore: scored ? Math.round((scoreSum / scored) * 10) / 10 : null,
        distribution,
        topGenres: top(genres, 5),
        formats: top(formats, 4),
    };
}

function bar(count, most, width = 10) {
    if (!count || !most) return '';
    return '▰'.repeat(Math.max(1, Math.round((count / most) * width)));
}

function distributionLines(distribution) {
    const most = Math.max(...distribution);
    if (!most) return 'No scores yet. Rate a show with /animelist edit.';
    const lines = [];
    for (let index = 9; index >= 0; index -= 1) {
        const count = distribution[index];
        if (!count) continue;
        lines.push(`\`${String(index + 1).padStart(2, ' ')}\` ${bar(count, most)} ${formatNumber(count)}`);
    }
    return lines.join('\n');
}

function statsSummary(stats) {
    if (!stats.total) return '';
    const parts = [`${formatNumber(stats.total)} shows`];
    if (stats.episodes) parts.push(`${formatNumber(stats.episodes)} eps`);
    if (stats.days >= 0.1) parts.push(`${stats.days.toFixed(1)} days`);
    if (stats.meanScore) parts.push(`★${scoreText(stats.meanScore)} avg`);
    return parts.join(' · ');
}

function statsEmbed(profile, user) {
    const stats = computeStats(profile);
    const name = neutralize(user && (user.globalName || user.username), 64) || 'Anime';
    const countLines = STATUSES.map((status) => `${status.emoji} ${status.label}: **${formatNumber(stats.counts[status.id])}**`);
    const embed = styledEmbed({
        title: `📊 ${name}'s anime stats`,
        description: stats.total ? statsSummary(stats) : 'No shows yet. Start with /watching add or /planning add.',
        label: 'profile',
    }).addFields(
        { name: 'Total anime', value: `**${formatNumber(stats.total)}**`, inline: true },
        { name: 'Episodes watched', value: `**${formatNumber(stats.episodes)}**`, inline: true },
        { name: 'Days watched', value: `**${stats.days.toFixed(1)}**`, inline: true },
        { name: 'Mean score', value: stats.meanScore ? `**★${scoreText(stats.meanScore)}**` : '—', inline: true },
        { name: 'Scored', value: `**${formatNumber(stats.scored)}**`, inline: true },
        { name: '​', value: '​', inline: true },
        { name: 'Lists', value: countLines.join('\n').slice(0, 1024), inline: true },
        { name: 'Score spread', value: distributionLines(stats.distribution).slice(0, 1024), inline: true },
        {
            name: 'Top genres',
            value: (stats.topGenres.map(([genre, count]) => `${neutralize(genre, 40)} · ${formatNumber(count)}`).join('\n') || '—').slice(0, 1024),
            inline: true,
        },
    );
    if (stats.formats.length) {
        embed.addFields({
            name: 'Formats',
            value: stats.formats.map(([format, count]) => `${format} ${formatNumber(count)}`).join(' · ').slice(0, 1024),
            inline: false,
        });
    }
    if (user && typeof user.displayAvatarURL === 'function') embed.setThumbnail(user.displayAvatarURL());
    return embed;
}

module.exports = {
    DEFAULT_DURATION,
    computeStats,
    statsSummary,
    statsEmbed,
    distributionLines,
};
