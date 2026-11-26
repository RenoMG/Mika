// One news story as a Discord message: the editable line above (with the
// optional role ping), then an embed in the site's colour with the headline,
// a short excerpt, the story's picture, and a button to read it on the site.
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    escapeMarkdown,
} = require('discord.js');
const { formatMessage } = require('../utils/formatMessage');
const { excerptOf } = require('../blog/post');

const NEWS_COLOR = 0xF47521;
const CONTENT_MAX = 2000;
const MAX_TAGS = 3;

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

// A site's own section names ("Latest News", "News") say nothing in a news channel.
function topicTags(item) {
    return (item.categories || [])
        .filter((tag) => !/^(latest |anime |manga )?news$/i.test(String(tag).trim()))
        .slice(0, MAX_TAGS)
        .map((tag) => shorten(tag, 40));
}

function newsEmbed(source, feed, item) {
    const embed = new EmbedBuilder().setColor(source.color || NEWS_COLOR);
    const home = safeUrl(source.home) || safeUrl(feed && feed.link);
    const icon = safeUrl(feed && feed.icon);
    embed.setAuthor({ name: `${source.emoji} ${source.name}`.slice(0, 256), ...(home ? { url: home } : {}), ...(icon ? { iconURL: icon } : {}) });
    embed.setTitle(shorten(item.title || 'News', 256));
    const link = safeUrl(item.link);
    if (link) embed.setURL(link);
    const excerpt = excerptOf(item);
    if (excerpt) embed.setDescription(escapeMarkdown(excerpt));
    const image = safeUrl(item.image);
    if (image) embed.setImage(image);
    const tags = topicTags(item);
    const footer = [item.author ? `By ${shorten(item.author, 60)}` : null, tags.length ? tags.join(' · ') : null]
        .filter(Boolean).join('  •  ');
    embed.setFooter({ text: (footer || source.name).slice(0, 2048) });
    if (item.published) embed.setTimestamp(item.published);
    return embed;
}

function newsButtons(source, item) {
    const link = safeUrl(item.link);
    if (!link) return [];
    return [new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(link)
        .setLabel(`Read on ${source.name}`.slice(0, 80))
        .setEmoji('📖'))];
}

// Placeholder values for the line above the embed. The link is wrapped in <>
// so Discord does not add a second preview under Mika's embed.
function messageValues(source, item) {
    const link = safeUrl(item.link);
    return {
        title: escapeMarkdown(shorten(item.title || 'News', 200)),
        link: link ? `<${link}>` : '',
        source: escapeMarkdown(source.name),
        author: escapeMarkdown(shorten(item.author || source.name, 80)),
        category: escapeMarkdown(shorten(topicTags(item)[0] || 'News', 60)),
    };
}

function newsMessage(source, feed, item, { template, roleId = null } = {}) {
    const line = formatMessage(template, messageValues(source, item)).trim();
    const content = [roleId ? `<@&${roleId}>` : null, line].filter(Boolean).join(' ').slice(0, CONTENT_MAX);
    return {
        ...(content ? { content } : {}),
        embeds: [newsEmbed(source, feed, item)],
        components: newsButtons(source, item),
        allowedMentions: { parse: [], users: [], roles: roleId ? [roleId] : [], repliedUser: false },
    };
}

module.exports = {
    NEWS_COLOR,
    topicTags,
    messageValues,
    newsEmbed,
    newsMessage,
};
