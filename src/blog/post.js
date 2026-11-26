// Turns one feed entry into the Discord message: the editable line above, then
// an embed shaped around how Reno's World posts read. Reviews end with a
// "Rating:" block (Animation: 6/10, Story: 8/10, ...) and an "Infos:" block
// (Watched on, dubs, release date, written or directed by). Those become their
// own fields. Posts from other blogs, or without those blocks, still get the
// title, excerpt, cover image, categories, and reading time.
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    escapeMarkdown,
} = require('discord.js');
const { formatMessage } = require('../utils/formatMessage');
const { decodeEntities } = require('./feed');

// The pale yellow accent from the renos.world theme.
const BLOG_COLOR = 0xFEF6B2;
const EXCERPT_MAX = 320;
const WORDS_PER_MINUTE = 200;
const CONTENT_MAX = 2000;
const MAX_TAGS = 4;
const MAX_DETAILS = 6;

// The first category that matches sets the emoji on the footer.
const KINDS = [
    { test: /^anime$/i, emoji: '🎌' },
    { test: /^(live[- ]?action|movie|movies|film|tv)$/i, emoji: '🎬' },
    { test: /^(travel|japan|trave-guide|travel[- ]guide)$/i, emoji: '✈️' },
    { test: /^(tech|linux|windows|ai|programming|code)$/i, emoji: '💻' },
    { test: /update/i, emoji: '📢' },
];

function kindEmoji(categories) {
    for (const category of categories || []) {
        const kind = KINDS.find((entry) => entry.test.test(category));
        if (kind) return kind.emoji;
    }
    return '📝';
}

// HTML to readable text, one line per paragraph.
function plainText(html) {
    const text = String(html || '')
        .replace(/<(script|style|noscript|iframe|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|blockquote|figure|figcaption|tr|pre)\s*>/gi, '\n')
        .replace(/<(hr|p|div|h[1-6]|li|blockquote|tr)\b[^>]*>/gi, '\n')
        .replace(/<[^>]*>/g, '');
    return decodeEntities(text)
        .replace(/ /g, ' ')
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}

function shorten(text, max) {
    const clean = String(text || '').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

// WordPress appends "The post X appeared first on Y." to every summary.
function withoutBoilerplate(lines) {
    return lines.filter((line) => !/^The post .+ appeared first on .+\.?$/i.test(line));
}

function excerptOf(item) {
    const fromSummary = withoutBoilerplate(plainText(item.summary).split('\n'));
    const fromContent = withoutBoilerplate(plainText(item.html).split('\n'));
    const lines = fromSummary.join(' ').length >= 80 ? fromSummary : fromContent;
    const text = lines.join(' ')
        .replace(/\s*\[(…|\.\.\.)\]\s*$/, '…')
        .replace(/\s+/g, ' ');
    return shorten(text, EXCERPT_MAX);
}

const RATING_LINE = /^([^:]{1,40}):\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*$/;
const DETAIL_LINE = /^([^:]{1,40}):\s*(.{1,200})$/;
const RATING_HEADER = /^ratings?\s*:?\s*$/i;
const INFO_HEADER = /^(infos?|details)\s*:?\s*$/i;

// The Rating: and Infos: blocks at the end of a review.
function reviewOf(html) {
    const lines = plainText(html).split('\n');
    const start = lines.findIndex((line) => RATING_HEADER.test(line));
    if (start === -1) return { ratings: [], details: [] };
    const ratings = [];
    const details = [];
    for (const line of lines.slice(start + 1, start + 40)) {
        if (INFO_HEADER.test(line)) continue;
        if (/^The post .+ appeared first on/i.test(line)) break;
        const rating = RATING_LINE.exec(line);
        if (rating) {
            if (!details.length) ratings.push({ name: rating[1].trim(), score: rating[2], out: rating[3] });
            continue;
        }
        const detail = DETAIL_LINE.exec(line);
        if (detail) {
            details.push({ name: detail[1].trim(), value: detail[2].trim() });
            continue;
        }
        // A plain paragraph after the details means the review moved on.
        if (details.length || ratings.length) break;
    }
    return { ratings: ratings.slice(0, 6), details: details.slice(0, MAX_DETAILS) };
}

function readingMinutes(html) {
    const words = plainText(html).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function cleanName(value, max = 100) {
    return shorten(String(value || '').replace(/\s+/g, ' '), max);
}

function safeUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch (error) {
        return null;
    }
}

function postEmbed(feed, item) {
    const embed = new EmbedBuilder().setColor(BLOG_COLOR);
    const blogName = cleanName(feed.title, 256) || 'Blog';
    const blogUrl = safeUrl(feed.link);
    const icon = safeUrl(feed.icon);
    embed.setAuthor({ name: blogName, ...(blogUrl ? { url: blogUrl } : {}), ...(icon ? { iconURL: icon } : {}) });

    const link = safeUrl(item.link);
    embed.setTitle(cleanName(item.title || 'New post', 256));
    if (link) embed.setURL(link);
    const excerpt = excerptOf(item);
    if (excerpt) embed.setDescription(escapeMarkdown(excerpt));

    const { ratings, details } = reviewOf(item.html);
    const fields = [];
    if (ratings.length) {
        fields.push({
            name: '⭐ Rating',
            value: ratings.map((entry) => `**${escapeMarkdown(entry.name)}** ${entry.score}/${entry.out}`).join('\n').slice(0, 1024),
            inline: true,
        });
    }
    if (details.length) {
        fields.push({
            name: 'ℹ️ Details',
            value: details.map((entry) => `**${escapeMarkdown(entry.name.replace(/\?$/, ''))}:** ${escapeMarkdown(cleanName(entry.value, 120))}`).join('\n').slice(0, 1024),
            inline: true,
        });
    }
    if (fields.length) embed.addFields(fields);

    const image = safeUrl(item.image);
    if (image) embed.setImage(image);

    const tags = (item.categories || []).slice(0, MAX_TAGS).map((tag) => cleanName(tag, 40));
    const minutes = readingMinutes(item.html);
    const byline = item.author ? `By ${cleanName(item.author, 60)}` : null;
    const footer = [byline, tags.length ? `${kindEmoji(item.categories)} ${tags.join(' · ')}` : null, `${minutes} min read`]
        .filter(Boolean).join('  •  ');
    embed.setFooter({ text: footer.slice(0, 2048) });
    if (item.published) embed.setTimestamp(item.published);
    return embed;
}

function postButtons(feed, item) {
    const link = safeUrl(item.link);
    if (!link) return [];
    const buttons = [new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(link)
        .setLabel(`Read on ${cleanName(feed.title, 60) || 'the blog'}`.slice(0, 80))
        .setEmoji('📖')];
    const home = safeUrl(feed.link);
    if (home && home !== link) {
        buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(home).setLabel('More posts').setEmoji('🌐'));
    }
    return [new ActionRowBuilder().addComponents(buttons)];
}

// Placeholder values for the message above the embed. Markdown in titles is
// escaped, and the link is wrapped in <> so Discord does not add a second preview.
function messageValues(feed, item) {
    const link = safeUrl(item.link);
    return {
        title: escapeMarkdown(cleanName(item.title || 'New post', 200)),
        link: link ? `<${link}>` : '',
        author: escapeMarkdown(cleanName(item.author || feed.title || 'Someone', 80)),
        blog: escapeMarkdown(cleanName(feed.title || 'the blog', 100)),
        category: escapeMarkdown(cleanName((item.categories || [])[0] || 'Blog', 60)),
    };
}

// The whole message: optional role ping, the editable line, the embed, and buttons.
function postMessage(feed, item, { template, roleId = null } = {}) {
    const line = formatMessage(template, messageValues(feed, item)).trim();
    const content = [roleId ? `<@&${roleId}>` : null, line].filter(Boolean).join(' ').slice(0, CONTENT_MAX);
    return {
        ...(content ? { content } : {}),
        embeds: [postEmbed(feed, item)],
        components: postButtons(feed, item),
        allowedMentions: { parse: [], users: [], roles: roleId ? [roleId] : [], repliedUser: false },
    };
}

module.exports = {
    BLOG_COLOR,
    EXCERPT_MAX,
    plainText,
    excerptOf,
    reviewOf,
    readingMinutes,
    kindEmoji,
    messageValues,
    postEmbed,
    postMessage,
};
