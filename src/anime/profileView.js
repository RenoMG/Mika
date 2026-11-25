const { allowedMentions } = require('../utils/mentions');
const { profileCompletedLines } = require('./completed');
const { readFavorites } = require('./favorites');
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

function profileFooter(profile, self) {
    if (!self) return [];
    const recs = profile && profile.recommendations ? 'Recs on' : 'Recs off';
    return [visibilityLabel(profile), recs];
}

function profileEmbed(profile, user, { self = false } = {}) {
    const name = clean(user && (user.globalName || user.username), 64) || 'Anime profile';
    const embed = styledEmbed({
        title: `${name}'s anime profile`,
        description: quoteBlock(profile && profile.bio),
        label: 'profile',
        extra: profileFooter(profile, self),
    })
        .addFields(
            { name: '📺 Watching', value: watchingValue(profile || {}), inline: true },
            { name: '⭐ Favorites', value: favoritesValue(profile || {}), inline: true },
            { name: '✅ Completed', value: completedValue(profile || {}), inline: true },
            { name: '🎭 Genres', value: tasteValue(profile && profile.genres), inline: true },
            { name: '🏷️ Tags', value: tasteValue(profile && profile.tags), inline: true },
            spacer(),
        );
    if (user && typeof user.displayAvatarURL === 'function') embed.setThumbnail(user.displayAvatarURL());
    return {
        embeds: [embed],
        allowedMentions: allowedMentions(),
    };
}

function settingsEmbed(profile) {
    const global = Boolean(profile && profile.discoverable);
    const recs = Boolean(profile && profile.recommendations);
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
    );
}

module.exports = { profileEmbed, settingsEmbed };
