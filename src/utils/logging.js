const { EmbedBuilder, PermissionsBitField, escapeMarkdown } = require('discord.js');
const { COLORS, footer } = require('./style');
const { getGuildConfig } = require('./getGuildConfig');
const { allowedMentions } = require('./mentions');
const { createCache } = require('../anime/cache');
const { redact } = require('./redact');
const audits = createCache({ max: 200, ttlMs: 2000 });
const pending = new Map();
const { firstValue: field } = require('./configStatus');
async function logChannel(guild, config) {
    if (!guild?.id) return null;
    const data = config || await getGuildConfig(guild.id, { readOnly: true });
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
    if (value == null || value === '') return 'None';
    return String(value).slice(0, max);
}

// Names chosen by members (channels, roles, emojis, events) are escaped, so a
// name such as "**x**" shows as typed instead of restyling the log.
function plain(value, max = 1000) {
    if (value == null || value === '') return 'None';
    return escapeMarkdown(String(value).slice(0, max));
}

// Titles and colors by event. Created is green, removed is red, changed is yellow.
const EVENTS = {
    channelCreate: '📁 Channel created',
    channelDelete: '📁 Channel deleted',
    channelUpdate: '📁 Channel updated',
    emojiCreate: '😀 Emoji added',
    emojiDelete: '😀 Emoji removed',
    emojiUpdate: '😀 Emoji updated',
    guildMemberUpdate: '👤 Member updated',
    guildScheduledEventCreate: '📅 Event created',
    guildScheduledEventDelete: '📅 Event deleted',
    guildScheduledEventUpdate: '📅 Event updated',
    guildUpdate: '🏠 Server updated',
    roleCreate: '🎭 Role created',
    roleDelete: '🎭 Role deleted',
    roleUpdate: '🎭 Role updated',
    threadCreate: '🧵 Thread created',
    threadDelete: '🧵 Thread deleted',
    threadUpdate: '🧵 Thread updated',
};

const FIELD_NAMES = {
    name: 'Name',
    topic: 'Topic',
    type: 'Type',
    userLimit: 'User limit',
    bitrate: 'Bitrate',
    rawPosition: 'Position',
    position: 'Position',
    rateLimitPerUser: 'Slowmode',
    nsfw: 'Age-restricted',
    defaultAutoArchiveDuration: 'Default archive time',
    autoArchiveDuration: 'Archive time',
    'permissionOverwrites.cache': 'Permission overrides',
    'permissions.bitfield': 'Permissions',
    color: 'Color',
    hoist: 'Shown separately',
    mentionable: 'Mentionable',
    nickname: 'Nickname',
    'user.username': 'Username',
    avatar: 'Server avatar',
    description: 'Description',
    status: 'Status',
    icon: 'Icon',
    ownerId: 'Owner',
    verificationLevel: 'Verification level',
    archived: 'Archived',
    locked: 'Locked',
    scheduledStartTimestamp: 'Starts',
    scheduledEndTimestamp: 'Ends',
};

function colorFor(name) {
    if (/(Create|Add|Join)$/.test(name)) return COLORS.success;
    if (/(Delete|Remove|Leave)$/.test(name)) return COLORS.danger;
    return COLORS.warning;
}

function titleFor(name) {
    if (EVENTS[name]) return EVENTS[name];
    const words = name.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

async function sendLog(channel, title, description, color = COLORS.warning) {
    if (!channel) return;
    const embed = new EmbedBuilder().setTitle(text(title, 256)).setDescription(text(description, 4096))
        .setColor(color).setTimestamp().setFooter(footer('logs'));
    return channel.send({ embeds: [embed], allowedMentions: allowedMentions() });
}
function getPath(item, key) {
    const value = key.split('.').reduce((entry, part) => entry?.[part], item);
    if (key === 'permissionOverwrites.cache' && value?.values) {
        return JSON.stringify([...value.values()].map((entry) => [entry.id, entry.type, String(entry.allow.bitfield), String(entry.deny.bitfield)]).sort());
    }
    return value;
}

function permissionNames(bits) {
    try {
        return new PermissionsBitField(BigInt(bits)).toArray().map((name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
    } catch {
        return [];
    }
}

function shownValue(key, value) {
    if (value == null || value === '') return 'None';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (key === 'color') return `#${Number(value).toString(16).padStart(6, '0')}`;
    if (key === 'rateLimitPerUser') return Number(value) ? `${value}s` : 'Off';
    if (key === 'ownerId') return `<@${value}>`;
    if (key.endsWith('Timestamp')) return Number(value) ? `<t:${Math.floor(Number(value) / 1000)}:f>` : 'None';
    return plain(value, 500);
}

// One readable line per changed setting. Internal values (permission bits,
// override lists, image hashes) become plain words instead of raw data.
function changeLine(key, before, after) {
    const label = FIELD_NAMES[key] || key;
    if (key === 'permissionOverwrites.cache') return `**${label}** changed`;
    if (key === 'avatar' || key === 'icon') return `**${label}** changed`;
    if (key === 'permissions.bitfield') {
        const old = new Set(permissionNames(before));
        const now = new Set(permissionNames(after));
        const added = [...now].filter((name) => !old.has(name));
        const removed = [...old].filter((name) => !now.has(name));
        const parts = [];
        if (added.length) parts.push(`➕ ${added.join(', ')}`);
        if (removed.length) parts.push(`➖ ${removed.join(', ')}`);
        return `**${label}:** ${parts.join(' · ') || 'changed'}`.slice(0, 1000);
    }
    return `**${label}:** ${shownValue(key, before)} → ${shownValue(key, after)}`;
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
        const who = actor ? `${actor}` : 'Unknown';
        const subject = name === 'guildMemberUpdate' ? `<@${item.id}>` : `**${plain(item.name || item.id, 200)}**`;
        const lines = [`${subject} · \`${item.id}\``];
        if (type) lines.push(`**By:** ${who}`);
        if (changes.length) lines.push('', ...changes.map((key) => changeLine(key, getPath(before, key), getPath(item, key))));
        await sendLog(channel, titleFor(name), lines.join('\n'), colorFor(name));
    } };
}
module.exports = { logChannel, auditActor, sendLog, field, text, plain, eventLogger, changeLine, titleFor, colorFor };
