const { allValues, firstValue, isOn } = require('../utils/configStatus');
const { snowflake } = require('../utils/safeId');
const { DEFAULT_SOURCE_IDS, SOURCE_IDS } = require('./sources');

const DEFAULT_RELEASE_MESSAGE = '📺 **{title}**: {episode} just dropped!';
const RELEASE_KEYS = new Set(['ReleaseStatus', 'ReleaseChannel', 'ReleaseMessage', 'ReleaseRole', 'ReleaseSources']);

function releasesEnabled(config) {
    return isOn(config, 'ReleaseStatus');
}

function releaseChannel(config) {
    return snowflake(firstValue(config, 'ReleaseChannel', 'Channel'));
}

function releaseMessage(config) {
    const saved = firstValue(config, 'ReleaseMessage', 'Message');
    return saved.trim() ? saved : DEFAULT_RELEASE_MESSAGE;
}

function releaseRole(config) {
    return snowflake(firstValue(config, 'ReleaseRole', 'Role'));
}

// The followed release types, in listed order. No saved list means the defaults.
function releaseSources(config) {
    const list = config ? config.ReleaseSources : undefined;
    if (!Array.isArray(list)) return [...DEFAULT_SOURCE_IDS];
    const picked = new Set(allValues(config, 'ReleaseSources', 'Source'));
    return SOURCE_IDS.filter((id) => picked.has(id));
}

module.exports = {
    DEFAULT_RELEASE_MESSAGE,
    RELEASE_KEYS,
    releasesEnabled,
    releaseChannel,
    releaseMessage,
    releaseRole,
    releaseSources,
};
