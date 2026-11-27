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
const { DEFAULT_BLOG_FEED, DEFAULT_BLOG_MESSAGE } = require('../../../blog/settings');
const { DEFAULT_NEWS_MESSAGE, newsSources } = require('../../../news/settings');
const { SOURCES } = require('../../../news/sources');
const { LEVEL_ROLES_MAX, levelRoles } = require('../../../utils/levelRoles');

const TEXT_MAX = 1000;
const TOKENS = '`{user}` mention · `{userd}` display name';
const GREETING_HINT = '{user}=mention, {userd}=display name';
const LEVEL_HINT = '{user}=mention, {userd}=display name, {level}=new level';
const BLOG_HINT = '{title} {link} {author} {blog} {category}';
const BLOG_TOKENS = '`{title}` post title · `{link}` post link · `{author}` writer · `{blog}` blog name · `{category}` first category';
const NEWS_HINT = '{title} {link} {source} {author} {category}';
const NEWS_TOKENS = '`{title}` headline · `{link}` story link · `{source}` news site · `{author}` writer · `{category}` first topic';
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
        blurb: 'Turn whole features on or off. Each one lists what it covers.',
        // Every whole-feature switch lives here. Leveling, Logging, and Guess That
        // Anime also show theirs in their own section; both are one stored setting.
        controls: [
            { id: 'moderation', kind: 'toggle', key: 'ModerationCommandStatus', label: 'Moderation', defaultOn: true },
            { id: 'anime', kind: 'toggle', key: 'AnimeCommandStatus', label: 'Anime lookups', defaultOn: true },
            { id: 'meme', kind: 'toggle', key: 'MemeCommandStatus', label: 'Memes', defaultOn: true },
            { id: 'guess', kind: 'toggle', key: 'GuessCommandStatus', label: 'Guess That Anime', defaultOn: true, covers: 'Rounds, duels, the shop, and auto-drops.' },
            { id: 'information', kind: 'toggle', key: 'InfoCommandStatus', label: 'Info & utility', defaultOn: true },
            { id: 'leveling', kind: 'toggle', key: 'LevelingCommandStatus', label: 'Leveling', covers: 'Chat XP and level-up messages.' },
            { id: 'logging', kind: 'toggle', key: 'LoggingStatus', label: 'Logging', covers: 'Posts joins, leaves, message edits and deletes, server changes, and mod actions to the log channel.' },
        ],
        // One field per switch: its state in the name, then what it covers.
        fields: (data) => sectionOf('features').controls.map((control) => ({
            name: `${toggleOn(data, control) ? '🟢' : '🔴'} ${control.label}`,
            value: coverage(control),
            inline: false,
        })),
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
        blurb: 'XP, level-up channel and message, and roles earned at each level.',
        controls: [
            // The same setting as Leveling under Features, shown where people look for it.
            { id: 'status', kind: 'toggle', key: 'LevelingCommandStatus', label: 'Leveling' },
            { id: 'channel', kind: 'channel', key: 'Levelupchannel', label: 'Level-up channel', posts: true, empty: 'Same channel as the message' },
            { id: 'roles', kind: 'levelroles', key: 'LevelRoles', label: 'Level roles' },
            { id: 'message', kind: 'text', key: 'Levelupmessage', label: 'Level-up message', short: 'message', fallback: DEFAULT_LEVEL_MESSAGE, hint: LEVEL_HINT, blankIsDefault: true },
        ],
        note: { name: 'Placeholders', value: `${TOKENS} · \`{level}\` new level\n-# Level roles stack: reaching level 10 adds its role and keeps the level 5 one. Members who are already past a level get its role the next time they earn XP. Up to ${LEVEL_ROLES_MAX} level roles.` },
        fields: (data, shown) => [
            { name: 'Leveling', value: shown('status'), inline: true },
            { name: 'Level-up channel', value: shown('channel'), inline: true },
            { name: 'Level roles', value: shown('roles'), inline: false },
            { name: 'Level-up message', value: shown('message'), inline: false },
        ],
        summary: (data, shown) => {
            if (!toggleOn(data, controlOf('leveling', 'status'))) return '🔴 Off';
            const count = levelRoles(data).length;
            const roles = count ? ` · ${count} level ${count === 1 ? 'role' : 'roles'}` : '';
            return `🟢 Level-ups in ${listValues(data.Levelupchannel, 'Channel').length ? shown('channel') : 'the same channel'}${roles}`;
        },
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
    {
        id: 'blog',
        label: 'Blog Watcher',
        emoji: '📰',
        blurb: 'Posts new blog entries to a channel. Starts on renos.world; any blog with an RSS or Atom feed works.',
        controls: [
            { id: 'status', kind: 'toggle', key: 'BlogStatus', label: 'Blog Watcher' },
            { id: 'preview', kind: 'preview', label: 'Preview latest post' },
            { id: 'channel', kind: 'channel', key: 'BlogChannel', label: 'Post channel', posts: true },
            // Only mentioned, never assigned, so any role but @everyone can be picked.
            { id: 'role', kind: 'role', key: 'BlogRole', label: 'Ping role', ping: true, empty: 'No ping' },
            { id: 'message', kind: 'text', key: 'BlogMessage', label: 'Post message', short: 'message', fallback: DEFAULT_BLOG_MESSAGE, hint: BLOG_HINT, blankIsDefault: true },
            { id: 'feed', kind: 'text', key: 'BlogFeed', field: 'URL', label: 'Blog feed', short: 'feed', fallback: DEFAULT_BLOG_FEED, hint: 'A blog address or its RSS/Atom feed, e.g. renos.world', blankIsDefault: true, singleLine: true, max: 500, validates: 'feed' },
        ],
        note: { name: 'Placeholders', value: `${BLOG_TOKENS}\n-# The message sits above the post's embed. New posts are checked every 15 minutes.` },
        fields: (data, shown) => [
            { name: 'Blog Watcher', value: `${shown('status')} · ${shown('channel')}`, inline: true },
            { name: 'Ping role', value: shown('role'), inline: true },
            { name: 'Blog feed', value: shown('feed'), inline: false },
            { name: 'Post message', value: shown('message'), inline: false },
        ],
        summary: (data, shown) => (toggleOn(data, controlOf('blog', 'status'))
            ? `🟢 New posts in ${shown('channel')}`
            : '🔴 Off'),
    },
    {
        id: 'news',
        label: 'Anime News',
        emoji: '🗞️',
        blurb: 'Posts anime news from the sites you pick to a channel. Only news is posted, never reviews or features.',
        controls: [
            { id: 'status', kind: 'toggle', key: 'NewsStatus', label: 'Anime News' },
            { id: 'preview', kind: 'preview', label: 'Preview latest news' },
            { id: 'channel', kind: 'channel', key: 'NewsChannel', label: 'News channel', posts: true },
            { id: 'role', kind: 'role', key: 'NewsRole', label: 'Ping role', ping: true, empty: 'No ping' },
            { id: 'sources', kind: 'sources', key: 'NewsSources', label: 'News sites' },
            { id: 'message', kind: 'text', key: 'NewsMessage', label: 'News message', short: 'message', fallback: DEFAULT_NEWS_MESSAGE, hint: NEWS_HINT, blankIsDefault: true },
        ],
        note: { name: 'Placeholders', value: `${NEWS_TOKENS}\n-# The message sits above each story's embed. Sites are checked every 10 minutes, and at most 5 stories go out at a time.` },
        fields: (data, shown) => [
            { name: 'Anime News', value: `${shown('status')} · ${shown('channel')}`, inline: true },
            { name: 'Ping role', value: shown('role'), inline: true },
            { name: 'News sites', value: shown('sources'), inline: false },
            { name: 'News message', value: shown('message'), inline: false },
        ],
        summary: (data, shown) => {
            if (!toggleOn(data, controlOf('news', 'status'))) return '🔴 Off';
            const count = newsSources(data).length;
            return `🟢 ${count} ${count === 1 ? 'site' : 'sites'} in ${shown('channel')}`;
        },
    },
];

// The slash commands each switch turns off, read from the commands themselves
// (their configKey), so the list cannot drift when commands are added.
let commandNamesByKey = null;
function commandsFor(key) {
    if (!commandNamesByKey) {
        commandNamesByKey = new Map();
        const fs = require('node:fs');
        const path = require('node:path');
        const root = path.join(__dirname, '..', '..');
        for (const folder of fs.readdirSync(root)) {
            const dir = path.join(root, folder);
            if (!fs.statSync(dir).isDirectory()) continue;
            for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.js'))) {
                const command = require(path.join(dir, file));
                if (!command || !command.configKey || !command.data) continue;
                const names = commandNamesByKey.get(command.configKey) || [];
                names.push(command.data.name);
                commandNamesByKey.set(command.configKey, names);
            }
        }
        for (const names of commandNamesByKey.values()) names.sort();
    }
    return commandNamesByKey.get(key) || [];
}

function coverage(control) {
    const names = commandsFor(control.key).map((name) => `\`/${name}\``).join(' ');
    return [control.covers, names].filter(Boolean).join(names && control.covers ? ' Commands: ' : '') || 'No commands.';
}

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
    return listValues(data && data[control.key], control.field || 'Message').join('');
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
            return id ? `<@&${id}>` : (control.empty || 'Not set');
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
        case 'sources': {
            const followed = new Set(newsSources(data));
            return embedValue(SOURCES.map((source) => `${followed.has(source.id) ? '🟢' : '⚫'} ${source.emoji} ${source.name}`).join('\n')
                + (followed.size ? '' : '\n-# No sites picked, so nothing is posted.'));
        }
        case 'levelroles': {
            const rewards = levelRoles(data);
            return embedValue(rewards.length
                ? rewards.map((reward) => `• **Level ${reward.level}** → <@&${reward.roleId}>`).join('\n')
                : 'None yet. Pick a role below, then type the level that earns it.');
        }
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
        inline: !['text', 'channels', 'sources', 'levelroles'].includes(control.kind),
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
    commandsFor,
    toggleOn,
    intervalText,
    intervalChoices,
    textValue,
    isDefaultText,
    shownValue,
    sectionEmbed,
    homeEmbed,
};
