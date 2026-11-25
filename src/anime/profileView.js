const { allowedMentions } = require('../utils/mentions');
const { profileCompletedLines } = require('./completed');
const { ENTITY_KINDS, readEntities, readFavorites } = require('./favorites');
const { counts: listCounts } = require('./library');
const { computeStats, statsSummary } = require('./stats');
const { readCustomLists } = require('./customLists');
const { validUsername } = require('./anilistImport');
const { embed: styledEmbed } = require('../utils/style');
const { visibilityLabel, VISIBILITY_HELP } = require('./visibility');
const { neutralize } = require('./text');
const { profileWatchingLines } = require('./watching');

const TASTE_SHOWN = 10;

function clean(value, max) {
    return neutralize(value, max);
}

function spacer() {
    return { name: '\u200b', value: '\u200b', inline: true };
}

function quoteBlock(value) {
    const text = clean(value, 300) || 'Nothing yet';
    return text.split('\n').map((line) => `> ${line}`).join('\n').slice(0, 4096);
}

function nameList(items) {
    const list = [];
    for (const item of items || []) {
        const text = clean(item, 80);
        if (text && !list.includes(text)) list.push(text);
    }
    return list;
}

function fewLine(items, shown) {
    if (!items.length) return '';
    const head = items.slice(0, shown);
    const extra = items.length - head.length;
    return extra > 0 ? `${head.join(', ')} +${extra} more` : head.join(', ');
}

function tasteValue(items) {
    return (fewLine(nameList(items), TASTE_SHOWN) || 'Nothing yet').slice(0, 1024);
}

function favoritesValue(profile) {
    const list = readFavorites(profile);
    if (!list.length) return 'Nothing yet';
    return list.map((item, index) => `${index + 1}. ${clean(item.title, 80) || 'Anime'}`).join('\n').slice(0, 1024);
}

function fieldLines(lines) {
    if (!lines.length) return 'Nothing yet';
    return lines.join('\n').slice(0, 1024);
}

function watchingValue(profile) {
    return fieldLines(profileWatchingLines(profile));
}

function completedValue(profile) {
    return fieldLines(profileCompletedLines(profile));
}

function entityValue(profile, kind) {
    const names = readEntities(profile, kind).map((item) => clean(item.name, 60)).filter(Boolean);
    return fewLine(names, 6).slice(0, 1024);
}

function statsValue(profile) {
    const stats = computeStats(profile);
    const counts = listCounts(profile);
    const lines = [];
    const summary = statsSummary(stats);
    if (summary) lines.push(summary);
    const parts = [];
    if (counts.planning) parts.push(`🗓️ ${counts.planning} planned`);
    if (counts.rewatching) parts.push(`🔁 ${counts.rewatching} rewatching`);
    if (counts.paused) parts.push(`⏸️ ${counts.paused} paused`);
    if (counts.dropped) parts.push(`🗑️ ${counts.dropped} dropped`);
    if (parts.length) lines.push(parts.join(' · '));
    const custom = readCustomLists(profile);
    if (custom.length) lines.push(`🗂️ ${fewLine(custom.map((list) => list.name), 3)}`);
    return (lines.join('\n') || 'Nothing yet').slice(0, 1024);
}

function anilistUrl(profile) {
    const name = validUsername(profile && profile.anilist && profile.anilist.name);
    return name ? `https://anilist.co/user/${name}` : undefined;
}

function profileFooter(profile, self) {
    const linked = profile && profile.anilist && validUsername(profile.anilist.name);
    const source = linked ? `AniList: ${linked}` : '';
    if (!self) return [source];
    const recs = profile && profile.recommendations ? 'Recs on' : 'Recs off';
    return [visibilityLabel(profile), recs, source];
}

function profileEmbed(profile, user, { self = false } = {}) {
    const name = clean(user && (user.globalName || user.username), 64) || 'Anime profile';
    const embed = styledEmbed({
        title: `${name}'s anime profile`,
        description: quoteBlock(profile && profile.bio),
        label: 'profile',
        extra: profileFooter(profile, self),
        url: anilistUrl(profile),
    })
        .addFields(
            { name: '📺 Watching', value: watchingValue(profile || {}), inline: true },
            { name: '⭐ Favorites', value: favoritesValue(profile || {}), inline: true },
            { name: '✅ Completed', value: completedValue(profile || {}), inline: true },
            { name: '🎭 Genres', value: tasteValue(profile && profile.genres), inline: true },
            { name: '🏷️ Tags', value: tasteValue(profile && profile.tags), inline: true },
            { name: '📊 Stats', value: statsValue(profile || {}), inline: true },
        );
    // Characters, staff, and studios only take space once someone picks one.
    const extras = Object.entries(ENTITY_KINDS)
        .map(([kind, info]) => ({ kind, info, value: entityValue(profile || {}, kind) }))
        .filter((row) => row.value);
    if (extras.length) {
        for (const row of extras) {
            const label = `${row.info.plural[0].toUpperCase()}${row.info.plural.slice(1)}`;
            embed.addFields({ name: `${row.info.emoji} ${label}`, value: row.value, inline: true });
        }
        for (let index = extras.length; index < 3; index += 1) embed.addFields(spacer());
    }
    if (user && typeof user.displayAvatarURL === 'function') embed.setThumbnail(user.displayAvatarURL());
    return {
        embeds: [embed],
        allowedMentions: allowedMentions(),
    };
}

function settingsEmbed(profile) {
    const global = Boolean(profile && profile.discoverable);
    const recs = Boolean(profile && profile.recommendations);
    const activity = Boolean(profile && profile.activityFeed);
    const follows = Boolean(profile && profile.allowFollows);
    return styledEmbed({
        title: 'Anime profile settings',
        description: 'Change these with the options on /settings, or delete your profile below.',
        label: 'profile',
    }).addFields(
        {
            name: 'Visibility',
            value: `**${visibilityLabel(profile)}**\n${global ? VISIBILITY_HELP.global : VISIBILITY_HELP.local}`,
            inline: false,
        },
        {
            name: 'Recommendations',
            value: `**${recs ? '🟢 On' : '🔴 Off'}**\nPeople who share a server with you ${recs ? 'can' : "can't"} recommend anime to you.`,
            inline: false,
        },
        {
            name: 'Watch Feed activity',
            value: `**${activity ? '🟢 On' : '🔴 Off'}**\n${activity
                ? "Your list updates post in a server's Watch Feed channel when that server has one."
                : 'Your list updates stay off server Watch Feed channels.'}`,
            inline: false,
        },
        {
            name: 'Followers',
            value: `**${follows ? '🟢 On' : '🔴 Off'}**\n${follows
                ? 'People who can see your profile can follow you and get your updates by DM.'
                : 'Nobody can follow you. Turning this off removes current followers.'}`,
            inline: false,
        },
    );
}

module.exports = { profileEmbed, settingsEmbed };
