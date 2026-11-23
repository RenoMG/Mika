const { Colors, EmbedBuilder } = require('discord.js');
const { allowedMentions } = require('../utils/mentions');
const { snowflake } = require('./ids');
const { footer } = require('./embed');
const { neutralize } = require('./text');

const TASTE_SHOWN = 6;
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

function tasteValue(profile) {
    const genres = nameList(profile.genres);
    const tags = nameList(profile.tags);
    const lines = [fewLine(genres, TASTE_SHOWN), fewLine(tags, TASTE_SHOWN)].filter(Boolean);
    return (lines.length ? lines.join('\n') : 'Nothing yet').slice(0, 1024);
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
            { name: '⭐ Favorites', value: clean(profile && profile.favoriteTitle, 300) || 'Nothing yet', inline: true },
            spacer(),
            { name: '🎭 Genres', value: tasteValue(profile || {}), inline: true },
            { name: '💌 Accepted recs', value: acceptedValue(profile || {}, mentionIds), inline: true },
            spacer(),
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
            'Other servers can find and view the profile when this is on.',
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
