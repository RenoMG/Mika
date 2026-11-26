const { allValues, firstValue, isOn } = require('../utils/configStatus');
const { snowflake } = require('../utils/safeId');
const { DEFAULT_SOURCE_IDS, SOURCE_IDS } = require('./sources');

const DEFAULT_NEWS_MESSAGE = '📰 New anime news from **{source}**!';
const NEWS_KEYS = new Set(['NewsStatus', 'NewsChannel', 'NewsMessage', 'NewsRole', 'NewsSources']);

function newsEnabled(config) {
    return isOn(config, 'NewsStatus');
}

function newsChannel(config) {
    return snowflake(firstValue(config, 'NewsChannel', 'Channel'));
}

function newsMessage(config) {
    const saved = firstValue(config, 'NewsMessage', 'Message');
    return saved.trim() ? saved : DEFAULT_NEWS_MESSAGE;
}

function newsRole(config) {
    return snowflake(firstValue(config, 'NewsRole', 'Role'));
}

// The followed sites, in the order they are listed. A server saved before
// Anime News existed has no list and follows the default sites.
function newsSources(config) {
    const list = config ? config.NewsSources : undefined;
    if (!Array.isArray(list)) return [...DEFAULT_SOURCE_IDS];
    const picked = new Set(allValues(config, 'NewsSources', 'Source'));
    return SOURCE_IDS.filter((id) => picked.has(id));
}

module.exports = {
    DEFAULT_NEWS_MESSAGE,
    NEWS_KEYS,
    newsEnabled,
    newsChannel,
    newsMessage,
    newsRole,
    newsSources,
};
