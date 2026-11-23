const { Colors, EmbedBuilder } = require('discord.js');
const { allowedMentions } = require('../utils/mentions');
const { readFavorites } = require('./favorites');
const { snowflake } = require('./ids');
const { footer } = require('./embed');
const { neutralize } = require('./text');

const TASTE_SHOWN = 10;
const ACCEPTED_SHOWN = 3;

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

function acceptedValue(profile, mentionIds) {
    const accepted = Array.isArray(profile.accepted) ? profile.accepted : [];
    const recent = accepted.slice(-ACCEPTED_SHOWN).reverse();
    const lines = recent.map((item) => {
        const who = snowflake(item && item.fromUserId);
        if (who) mentionIds.push(who);
        const by = who ? `<@${who}>` : 'someone';
        const title = clean(item && item.title, 80) || 'Anime';
        return `• ${title} — ${by}`;
    });
    const extra = accepted.length - recent.length;
    if (extra > 0) lines.push(`+${extra} more`);
    return (lines.length ? lines.join('\n') : 'Nothing yet').slice(0, 1024);
}

function tasteValue(items) {
    return (fewLine(nameList(items), TASTE_SHOWN) || 'Nothing yet').slice(0, 1024);
}

function favoritesValue(profile) {
    const list = readFavorites(profile);
    if (!list.length) return 'Nothing yet';
    return list.map((item, index) => `${index + 1}. ${clean(item.title, 80) || 'Anime'}`).join('\n').slice(0, 1024);
}

function profileFooter(profile, self) {
    if (!self) return 'Mika | 🎌 anime';
    const privacy = profile && profile.discoverable ? '🌐 Discoverable' : '🔒 Hidden';
    const recs = profile && profile.recommendations ? 'recs on' : 'recs off';
    return `Mika | 🎌 anime · ${privacy} · ${recs}`;
}

function profileEmbed(profile, user, { self = false } = {}) {
    const name = clean(user && (user.globalName || user.username), 64) || 'Anime profile';
    const mentionIds = [];
    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`${name}'s anime profile`.slice(0, 256))
        .setDescription(quoteBlock(profile && profile.bio))
        .addFields(
            { name: '📺 Watching', value: clean(profile && profile.watching, 300) || 'Nothing yet', inline: true },
            { name: '⭐ Favorites', value: favoritesValue(profile || {}), inline: true },
            spacer(),
            { name: '🎭 Genres', value: tasteValue(profile && profile.genres), inline: true },
            { name: '🏷️ Tags', value: tasteValue(profile && profile.tags), inline: true },
            spacer(),
            { name: '💌 Accepted recs', value: acceptedValue(profile || {}, mentionIds), inline: false },
        )
        .setFooter(footer(profileFooter(profile, self)))
        .setTimestamp();
    if (user && typeof user.displayAvatarURL === 'function') embed.setThumbnail(user.displayAvatarURL());
    return {
        embeds: [embed],
        allowedMentions: allowedMentions(...mentionIds),
    };
}

function settingsEmbed(profile) {
    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Anime profile settings')
        .setDescription([
            `Discoverable: **${profile.discoverable ? 'on' : 'off'}**`,
            'Other servers can find this profile with /findprofile when this is on. People who share a server with you can still open it with /profile.',
            '',
            `Recommendations: **${profile.recommendations ? 'on' : 'off'}**`,
            'People who share a server with you can recommend anime when this is on.',
            '',
            'Use the options to change either setting, or delete the profile below.',
        ].join('\n'))
        .setFooter(footer('Mika | anime profile'))
        .setTimestamp();
    return embed;
}

module.exports = { profileEmbed, settingsEmbed };
