const { EmbedBuilder, Colors } = require('discord.js');
const { getGuildConfig } = require('./getGuildConfig');
const { allowedMentions } = require('./mentions');
const { createCache } = require('../anime/cache');
const { redact } = require('./redact');
const audits = createCache({ max: 200, ttlMs: 2000 });
const pending = new Map();
function field(config, key, property) { return config?.[key]?.[0]?.[property] || ''; }
async function logChannel(guild, config) {
    if (!guild?.id) return null;
    const data = config || await getGuildConfig(guild.id);
    if (field(data, 'LoggingStatus', 'Status') !== 'true') return null;
    const channel = guild.channels.cache.get(field(data, 'LoggingChannel', 'Channel'));
    return typeof channel?.send === 'function' ? channel : null;
}
async function auditActor(guild, type, targetId, at = Date.now()) {
    if (!type || !targetId || typeof guild?.fetchAuditLogs !== 'function') return null;
    const key = `${guild.id}:${type}`;
    try {
        let entries = audits.get(key);
        if (!entries) {
            if (!pending.has(key)) pending.set(key, guild.fetchAuditLogs({ type, limit: 10 })
                .then((logs) => { const list = [...logs.entries.values()]; audits.set(key, list); return list; })
                .finally(() => pending.delete(key)));
            entries = await pending.get(key);
        }
        return entries.find((entry) => entry.action === type && String(entry.targetId || entry.target?.id) === String(targetId)
            && Math.abs(at - entry.createdTimestamp) <= 10000)?.executor || null;
    } catch { return null; }
}
function text(value, max = 1000) {
    if (value == null || value === '') return 'Not set';
    return String(value).slice(0, max);
}
async function sendLog(channel, title, description, color = Colors.Yellow) {
    if (!channel) return;
    const embed = new EmbedBuilder().setTitle(text(title, 256)).setDescription(text(description, 4096))
        .setColor(color).setTimestamp().setFooter({ text: 'Mika | 📑 Logging' });
    return channel.send({ embeds: [embed], allowedMentions: allowedMentions() });
}
function getPath(item, key) {
    const value = key.split('.').reduce((entry, part) => entry?.[part], item);
    if (key === 'permissionOverwrites.cache' && value?.values) {
        return JSON.stringify([...value.values()].map((entry) => [entry.id, entry.type, String(entry.allow.bitfield), String(entry.deny.bitfield)]).sort());
    }
    return value;
}
function eventLogger({ name, type, fields = [], update = false }) {
    return { name, async execute(before, after) {
        const item = update ? after : before;
        const guild = item?.guild || (name === 'guildUpdate' ? item : null);
        if (!guild) return;
        const changes = update ? fields.filter((key) => String(getPath(before, key)) !== String(getPath(item, key))) : [];
        if (update && !changes.length) return;
        const channel = await logChannel(guild);
        if (!channel) return;
        const actor = await auditActor(guild, type, item.id);
        const who = actor ? `${actor}` : 'Unknown actor';
        const details = changes.map((key) => `**${key}**: ${text(getPath(before, key), 500)} → ${text(getPath(item, key), 500)}`).join('\n');
        await sendLog(channel, name.replace(/([A-Z])/g, ' $1').toUpperCase(),
            `${text(item.name || item.id)} (${item.id})\nActor: ${who}${details ? `\n${details}` : ''}`, name.endsWith('Delete') ? Colors.Red : Colors.Yellow);
    } };
}
module.exports = { logChannel, auditActor, sendLog, field, text, eventLogger };
