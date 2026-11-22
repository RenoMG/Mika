// Shared null-safe updates for /config subcommands. Optional slash options
// arrive as null, and older guild documents can be missing an array field.

function channelIdFrom(channel) {
    if (channel == null) return null;
    if (typeof channel === 'string') {
        const stripped = channel.replace(/</g, '').replace(/>/g, '').replace(/#/g, '').trim();
        return stripped || null;
    }
    if (typeof channel.id === 'string' && channel.id) return channel.id;
    if (typeof channel.toString !== 'function') return null;
    let text;
    try {
        text = channel.toString();
    } catch (error) {
        return null;
    }
    if (text == null) return null;
    const stripped = String(text).replace(/</g, '').replace(/>/g, '').replace(/#/g, '').trim();
    return stripped || null;
}

function mark(doc, key) {
    if (typeof doc.markModified === 'function') doc.markModified(key);
}

function setEntry(doc, key, entry) {
    if (!Array.isArray(doc[key])) doc[key] = [];
    const list = doc[key];
    if (list.length === 0) list.push(entry);
    else list.splice(0, 1, entry);
    mark(doc, key);
}

function setStatus(doc, key, status) {
    if (status == null) return;
    setEntry(doc, key, { Status: status });
}

function setKeyed(doc, key, field, value) {
    if (value == null) return;
    setEntry(doc, key, { [field]: value });
}

function pushKeyed(doc, key, field, value) {
    if (value == null) return;
    if (!Array.isArray(doc[key])) doc[key] = [];
    doc[key].push({ [field]: value });
    mark(doc, key);
}

function pullKeyed(doc, key, field, value) {
    if (value == null) return;
    if (!Array.isArray(doc[key])) doc[key] = [];
    const list = doc[key];
    if (typeof list.pull === 'function') list.pull({ [field]: value });
    else doc[key] = list.filter((entry) => !entry || entry[field] !== value);
    mark(doc, key);
}

function listValues(list, key) {
    if (!Array.isArray(list)) return [];
    return list
        .map((entry) => (entry ? entry[key] : undefined))
        .filter((value) => value != null && value !== '');
}

function statusText(list) {
    if (!Array.isArray(list)) return '';
    return `${list.map((entry) => (entry ? entry.Status : undefined))}`;
}

function embedValue(value, empty = 'Not set') {
    const text = value == null ? '' : String(value);
    const shown = text.trim() ? text : empty;
    return shown.length > 1024 ? `${shown.slice(0, 1021)}...` : shown;
}

async function loadConfig(guildId) {
    const { getGuildConfig } = require('../../../utils/getGuildConfig');
    const data = await getGuildConfig(guildId);
    if (data) return data;
    const configurationDB = require('../../../Models/ConfigurationDB');
    return new configurationDB({ GuildID: guildId });
}

module.exports = {
    channelIdFrom,
    setStatus,
    setKeyed,
    pushKeyed,
    pullKeyed,
    listValues,
    statusText,
    embedValue,
    loadConfig,
};
