const { Colors, EmbedBuilder } = require('discord.js');
const { allowedMentions } = require('../utils/mentions');
const { snowflake } = require('./ids');
const { footer } = require('./embed');
const { neutralize } = require('./text');

function line(value, fallback) {
    const text = neutralize(value, 300);
    return text || fallback;
}

function profileEmbed(profile, user, { self = false } = {}) {
    const name = neutralize(user && (user.globalName || user.username), 64) || 'Anime profile';
    const accepted = Array.isArray(profile.accepted) ? profile.accepted : [];
    const shown = accepted.slice(-8).reverse();
    const mentionIds = [];
    const lines = shown.map((item) => {
        const who = snowflake(item && item.fromUserId);
        if (who) mentionIds.push(who);
        const by = who ? `<@${who}>` : 'someone';
        return `• ${line(item && item.title, 'Anime')} — ${by}`;
    });
    const genres = (Array.isArray(profile.genres) ? profile.genres : []).map((entry) => neutralize(entry, 40)).filter(Boolean);
    const description = [
        self
            ? (profile.discoverable ? 'This profile is discoverable.' : 'This profile is hidden from everyone else.')
            : `${name}'s public anime profile.`,
        '',
        `**Bio**\n${line(profile.bio, 'No bio yet.')}`,
        `**Watching**\n${line(profile.watching, 'Nothing set.')}`,
        `**Favorite**\n${line(profile.favoriteTitle, 'Nothing set.')}`,
        `**Genres**\n${genres.length ? genres.join(', ') : 'Nothing set.'}`,
        `**Accepted recommendations**\n${lines.length ? lines.join('\n') : 'None yet.'}`,
    ];
    if (self) {
        description.push('', `Discoverable: ${profile.discoverable ? 'on' : 'off'}`, `Recommendations: ${profile.recommendations ? 'on' : 'off'}`);
    }
    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`${name}'s anime profile`.slice(0, 256))
        .setDescription(description.join('\n').slice(0, 4096))
        .setFooter(footer('Mika | anime profile'))
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
