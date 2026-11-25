// Every /config setting, once. Each section lists its controls; the hub builds
// the summary line, the section embed, and the buttons and menus from this list,
// and saving goes through the same entries. A new setting is one entry here.
const { isOff } = require('../../../utils/configStatus');
const { embed: styledEmbed } = require('../../../utils/style');
const { listValues, statusText, embedValue } = require('./fields');
const { intervalMinutes } = require('../../../guess/settings');
const {
    GUESS_INTERVAL_DEFAULT,
    GUESS_INTERVAL_MAX,
    GUESS_INTERVAL_MIN,
} = require('../../../guess/constants');
const {
    DEFAULT_FAREWELL_MESSAGE,
    DEFAULT_GREETING_MESSAGE,
    DEFAULT_LEVEL_MESSAGE,
} = require('../../../utils/formatMessage');

const TEXT_MAX = 1000;
const TOKENS = '`{user}` mention · `{userd}` display name';
const GREETING_HINT = '{user}=mention, {userd}=display name';
const LEVEL_HINT = '{user}=mention, {userd}=display name, {level}=new level';
const INTERVAL_PRESETS = [10, 15, 30, 60, 120, 360, 720, 1440];

// Toggles: `defaultOn` ones are feature categories that run unless switched
// off, so a guild saved before the toggle existed still reads as on.
const SECTIONS = [
    {
        id: 'welcome',
        label: 'Welcome',
        emoji: '👋',
        blurb: 'Greeting and farewell messages.',
        controls: [
            { id: 'greeting', kind: 'toggle', key: 'GreetingStatus', label: 'Greeting' },
            { id: 'farewell', kind: 'toggle', key: 'FarewellStatus', label: 'Farewell' },
            { id: 'gchannel', kind: 'channel', key: 'GreetingChannel', label: 'Greeting channel', posts: true },
            { id: 'fchannel', kind: 'channel', key: 'FarewellChannel', label: 'Farewell channel', posts: true },
            { id: 'gmessage', kind: 'text', key: 'GreetingMessage', label: 'Greeting message', short: 'greeting', fallback: DEFAULT_GREETING_MESSAGE, hint: GREETING_HINT },
            { id: 'fmessage', kind: 'text', key: 'FarewellMessage', label: 'Farewell message', short: 'farewell', fallback: DEFAULT_FAREWELL_MESSAGE, hint: GREETING_HINT },
        ],
        note: { name: 'Placeholders', value: TOKENS },
        // Status and channel share one field, so the two rows line up.
        fields: (data, shown) => [
            { name: 'Greeting', value: `${shown('greeting')} · ${shown('gchannel')}`, inline: true },
            { name: 'Farewell', value: `${shown('farewell')} · ${shown('fchannel')}`, inline: true },
            { name: 'Greeting message', value: shown('gmessage'), inline: false },
            { name: 'Farewell message', value: shown('fmessage'), inline: false },
        ],
        summary: (data, shown) => `Greeting ${shown('greeting')} · Farewell ${shown('farewell')}`,
    },
    {
        id: 'features',
        label: 'Features',
        emoji: '🧩',
        blurb: 'Turn whole command groups on or off.',
        controls: [
            { id: 'moderation', kind: 'toggle', key: 'ModerationCommandStatus', label: 'Moderation', defaultOn: true },
            { id: 'anime', kind: 'toggle', key: 'AnimeCommandStatus', label: 'Anime lookups', defaultOn: true },
            { id: 'meme', kind: 'toggle', key: 'MemeCommandStatus', label: 'Memes', defaultOn: true },
            { id: 'guess', kind: 'toggle', key: 'GuessCommandStatus', label: 'Guess That Anime', defaultOn: true },
            { id: 'information', kind: 'toggle', key: 'InfoCommandStatus', label: 'Information', defaultOn: true },
            { id: 'leveling', kind: 'toggle', key: 'LevelingCommandStatus', label: 'Leveling' },
        ],
        summary: (data) => {
            const toggles = sectionOf('features').controls;
            const on = toggles.filter((control) => toggleOn(data, control)).map((control) => control.label);
            const off = toggles.filter((control) => !toggleOn(data, control)).map((control) => control.label);
            if (!off.length) return '🟢 All on';
            if (!on.length) return '🔴 All off';
            return `🔴 Off: ${off.join(', ')}`;
        },
    },
    {
        id: 'restricted',
        label: 'Restricted channels',
        emoji: '🚫',
        blurb: 'Channels where commands are ignored and chat earns no XP.',
        controls: [
            { id: 'list', kind: 'channels', key: 'DisabledChannels', label: 'Restricted channels' },
        ],
        summary: (data) => {
            const count = new Set(listValues(data.DisabledChannels, 'Channels')).size;
            return count ? `${count} ${count === 1 ? 'channel' : 'channels'}` : 'None';
        },
    },
    {
        id: 'logging',
        label: 'Logging',
        emoji: '📑',
        blurb: 'Where server and moderation events are logged.',
        controls: [
            { id: 'status', kind: 'toggle', key: 'LoggingStatus', label: 'Logging' },
            { id: 'channel', kind: 'channel', key: 'LoggingChannel', label: 'Log channel', posts: true },
        ],
        summary: (data, shown) => (toggleOn(data, controlOf('logging', 'status'))
            ? `🟢 ${shown('channel')}` : '🔴 Off'),
    },
    {
        id: 'roles',
        label: 'Roles',
        emoji: '🎭',
        blurb: 'Auto-role for new members and the mute role.',
        controls: [
            { id: 'autostatus', kind: 'toggle', key: 'AutoroleStatus', label: 'Auto-role' },
            { id: 'autorole', kind: 'role', key: 'AutoroleRole', label: 'Auto-role role' },
            { id: 'muterole', kind: 'role', key: 'Muterole', label: 'Mute role' },
        ],
        summary: (data, shown) => `Auto-role: ${toggleOn(data, controlOf('roles', 'autostatus')) ? shown('autorole') : '🔴 Off'} · Mute role: ${shown('muterole')}`,
    },
    {
        id: 'leveling',
        label: 'Leveling',
        emoji: '🏆',
        blurb: 'XP, level-up channel, and message.',
        controls: [
            // The same setting as Leveling under Features, shown where people look for it.
            { id: 'status', kind: 'toggle', key: 'LevelingCommandStatus', label: 'Leveling' },
            { id: 'channel', kind: 'channel', key: 'Levelupchannel', label: 'Level-up channel', posts: true, empty: 'Same channel as the message' },
            { id: 'message', kind: 'text', key: 'Levelupmessage', label: 'Level-up message', short: 'message', fallback: DEFAULT_LEVEL_MESSAGE, hint: LEVEL_HINT, blankIsDefault: true },
        ],
        note: { name: 'Placeholders', value: `${TOKENS} · \`{level}\` new level` },
        summary: (data, shown) => (toggleOn(data, controlOf('leveling', 'status'))
            ? `🟢 Level-ups in ${listValues(data.Levelupchannel, 'Channel').length ? shown('channel') : 'the same channel'}`
            : '🔴 Off'),
    },
    {
        id: 'guess',
        label: 'Guess That Anime',
        emoji: '🎯',
        blurb: 'The game and its automatic screenshot drops.',
        controls: [
            // The same setting as Guess That Anime under Features.
            { id: 'game', kind: 'toggle', key: 'GuessCommandStatus', label: 'Game', defaultOn: true },
            { id: 'status', kind: 'toggle', key: 'GuessStatus', label: 'Auto-drops' },
            { id: 'channel', kind: 'channel', key: 'GuessChannel', label: 'Drop channel', posts: true },
            { id: 'interval', kind: 'interval', key: 'GuessInterval', label: 'Drop interval' },
        ],
        summary: (data, shown) => {
            if (!toggleOn(data, controlOf('guess', 'game'))) return '🔴 Game off';
            if (!toggleOn(data, controlOf('guess', 'status'))) return '🟢 Game on · Auto-drops off';
            return `🟢 Drops in ${shown('channel')} every ${intervalText(intervalMinutes(data))}`;
        },
    },
];

function sectionOf(id) {
    return SECTIONS.find((section) => section.id === id) || null;
}

function controlOf(sectionId, controlId) {
    const section = sectionOf(sectionId);
    return section ? section.controls.find((control) => control.id === controlId) || null : null;
}

function toggleOn(data, control) {
    return control.defaultOn ? !isOff(data, control.key) : statusText(data && data[control.key]) === 'true';
}

// "1 hour 30 minutes" instead of "90 minutes".
function intervalText(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const parts = [];
    if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    if (rest) parts.push(`${rest} ${rest === 1 ? 'minute' : 'minutes'}`);
    return parts.join(' ') || `${minutes} minutes`;
}

function intervalChoices(current) {
    const minutes = new Set(INTERVAL_PRESETS);
    if (Number.isInteger(current) && current >= GUESS_INTERVAL_MIN && current <= GUESS_INTERVAL_MAX) minutes.add(current);
    return [...minutes].sort((a, b) => a - b);
}

function textValue(data, control) {
    return listValues(data && data[control.key], 'Message').join('');
}

function isDefaultText(data, control) {
    const saved = textValue(data, control);
    return !saved.trim() || saved === control.fallback;
}

// The value of one control, written for an embed.
function shownValue(data, control) {
    switch (control.kind) {
        case 'toggle':
            return toggleOn(data, control) ? '🟢 On' : '🔴 Off';
        case 'channel': {
            const id = listValues(data && data[control.key], 'Channel')[0];
            return id ? `<#${id}>` : (control.empty || 'No channel');
        }
        case 'role': {
            const id = listValues(data && data[control.key], 'Role')[0];
            return id ? `<@&${id}>` : 'Not set';
        }
        case 'channels': {
            const ids = [...new Set(listValues(data && data[control.key], 'Channels'))];
            return embedValue(ids.length ? ids.map((id) => `• <#${id}>`).join('\n') : 'None');
        }
        case 'text': {
            const saved = textValue(data, control);
            return embedValue(saved.trim() ? saved : `*Default:* ${control.fallback}`);
        }
        case 'interval':
            return `Every **${intervalText(intervalMinutes(data))}**`;
        default:
            return '';
    }
}

function shownFor(section, data) {
    return (controlId) => {
        const control = section.controls.find((entry) => entry.id === controlId);
        return control ? shownValue(data || {}, control) : '';
    };
}

// Toggles, channels, roles, and the interval sit side by side; text and lists take a full row.
function defaultFields(section, data) {
    return section.controls.map((control) => ({
        name: control.label,
        value: shownValue(data, control),
        inline: control.kind !== 'text' && control.kind !== 'channels',
    }));
}

function sectionEmbed(sectionId, data = {}) {
    const section = sectionOf(sectionId);
    if (!section) return null;
    const fields = section.fields ? section.fields(data, shownFor(section, data)) : defaultFields(section, data);
    if (section.note) fields.push({ ...section.note, inline: false });
    return styledEmbed({
        title: `${section.emoji} ${section.label}`,
        description: section.blurb,
        label: 'config',
    }).addFields(fields);
}

function summaryLine(section, data = {}) {
    return `${section.emoji} **${section.label}** — ${section.summary(data, shownFor(section, data))}`;
}

function homeEmbed(data = {}) {
    return styledEmbed({
        title: '⚙️ Server settings',
        description: [
            ...SECTIONS.map((section) => summaryLine(section, data)),
            '',
            '-# Pick a section below to change it.',
        ].join('\n'),
        label: 'config',
    });
}

module.exports = {
    SECTIONS,
    TEXT_MAX,
    INTERVAL_PRESETS,
    GUESS_INTERVAL_DEFAULT,
    sectionOf,
    controlOf,
    toggleOn,
    intervalText,
    intervalChoices,
    textValue,
    isDefaultText,
    shownValue,
    sectionEmbed,
    homeEmbed,
};
