const { snowflake } = require('../utils/safeId');

function anilistId(value) {
    if (value == null || typeof value === 'object') return null;
    const text = String(value).trim();
    return /^\d{1,10}$/.test(text) ? text : null;
}

function mediaId(value) {
    if (value == null || typeof value === 'object') return null;
    const text = String(value).trim();
    if (/^\d{1,10}$/.test(text)) return text;
    if (/^kitsu:\d{1,10}$/.test(text)) return text;
    return null;
}

module.exports = { anilistId, mediaId, snowflake };
