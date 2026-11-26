const { firstValue, isOn } = require('../utils/configStatus');
const { snowflake } = require('../utils/safeId');

// Mika is Reno's World's own bot, so the watcher starts on Reno's blog.
const DEFAULT_BLOG_FEED = 'https://renos.world/feed/';
const DEFAULT_BLOG_MESSAGE = '📝 **{author}** just posted on **{blog}**!';
const BLOG_KEYS = new Set(['BlogStatus', 'BlogChannel', 'BlogFeed', 'BlogMessage', 'BlogRole']);

function blogEnabled(config) {
    return isOn(config, 'BlogStatus');
}

function blogChannel(config) {
    return snowflake(firstValue(config, 'BlogChannel', 'Channel'));
}

function blogFeed(config) {
    return firstValue(config, 'BlogFeed', 'URL').trim() || DEFAULT_BLOG_FEED;
}

function blogMessage(config) {
    const saved = firstValue(config, 'BlogMessage', 'Message');
    return saved.trim() ? saved : DEFAULT_BLOG_MESSAGE;
}

function blogRole(config) {
    return snowflake(firstValue(config, 'BlogRole', 'Role'));
}

module.exports = {
    DEFAULT_BLOG_FEED,
    DEFAULT_BLOG_MESSAGE,
    BLOG_KEYS,
    blogEnabled,
    blogChannel,
    blogFeed,
    blogMessage,
    blogRole,
};
