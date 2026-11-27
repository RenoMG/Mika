// Per-channel rules: each restricted channel lists exactly what is blocked
// there (a feature's commands, or chat XP), so #general can block Guess That
// Anime while still earning XP and letting moderators use moderation commands.
//
// Stored as ChannelRules: [{ Channel: '<id>', Blocks: ['guess', 'xp'] }].
// The older DisabledChannels list blocked everything in a channel; a channel
// still on it, with no rule of its own, keeps reading as "everything blocked"
// until its rule is saved from /config.
const { allValues } = require('./configStatus');

// One entry per thing a channel can block. `configKey` ties a block to the
// commands that carry that key; `other` covers commands with no feature key.
const BLOCKS = [
    { id: 'moderation', label: 'Moderation commands', emoji: '🛡️', configKey: 'ModerationCommandStatus' },
    { id: 'anime', label: 'Anime lookups', emoji: '🔎', configKey: 'AnimeCommandStatus' },
    { id: 'meme', label: 'Memes', emoji: '😂', configKey: 'MemeCommandStatus' },
    { id: 'guess', label: 'Guess That Anime', emoji: '🎯', configKey: 'GuessCommandStatus' },
    { id: 'information', label: 'Info & utility', emoji: 'ℹ️', configKey: 'InfoCommandStatus' },
    { id: 'leveling', label: 'Leveling commands', emoji: '🏆', configKey: 'LevelingCommandStatus' },
    { id: 'other', label: 'Help & config', emoji: '⚙️', configKey: null, covers: '`/help` `/config`' },
    { id: 'xp', label: 'Chat XP', emoji: '✨', covers: 'Messages sent here earn no XP.' },
];
const BLOCK_IDS = BLOCKS.map((block) => block.id);
const RULES_MAX = 25;

function blockOf(id) {
    return BLOCKS.find((block) => block.id === id) || null;
}

// Known block ids only, in their listed order, without repeats.
function cleanBlocks(values) {
    const picked = new Set(Array.isArray(values) ? values.map(String) : []);
    return BLOCK_IDS.filter((id) => picked.has(id));
}

// channel id -> blocked ids, for every channel with a rule. Saved rules win over
// the legacy list; a legacy channel blocks everything.
function channelRules(config) {
    const rules = new Map();
    const stored = config && Array.isArray(config.ChannelRules) ? config.ChannelRules : [];
    for (const rule of stored) {
        const id = rule && rule.Channel ? String(rule.Channel) : '';
        if (!id || rules.has(id)) continue;
        const blocks = cleanBlocks(rule.Blocks ? [...rule.Blocks] : []);
        if (blocks.length) rules.set(id, blocks);
    }
    for (const id of allValues(config, 'DisabledChannels', 'Channels')) {
        if (!rules.has(id) && !stored.some((rule) => rule && String(rule.Channel) === id)) rules.set(id, [...BLOCK_IDS]);
    }
    return rules;
}

function blocksIn(config, channelId) {
    if (!channelId) return [];
    return channelRules(config).get(String(channelId)) || [];
}

function blockForCommand(command) {
    const key = command && command.configKey;
    const match = key && BLOCKS.find((block) => block.configKey === key);
    return match ? match.id : 'other';
}

function commandBlockedIn(config, command, channelId) {
    return blocksIn(config, channelId).includes(blockForCommand(command));
}

function xpBlockedIn(config, channelId) {
    return blocksIn(config, channelId).includes('xp');
}

// Stored form of a rules map: [{ Channel, Blocks }], channels with nothing blocked dropped.
function toStoredRules(rules) {
    return [...rules.entries()]
        .filter(([, blocks]) => blocks.length)
        .map(([Channel, blocks]) => ({ Channel, Blocks: cleanBlocks(blocks) }));
}

module.exports = {
    BLOCKS,
    BLOCK_IDS,
    RULES_MAX,
    blockOf,
    cleanBlocks,
    channelRules,
    blocksIn,
    blockForCommand,
    commandBlockedIn,
    xpBlockedIn,
    toStoredRules,
};
