const Levels = require('../levels');
const { getGuildConfig } = require('../utils/getGuildConfig');

const XP_COOLDOWN_MS = 60 * 1000;
const DEFAULT_LEVEL_MESSAGE = '{user} has reached level {level}!';
const cooldowns = new Map();

Levels.setURL(`${process.env.MIKADATABASE}`).catch((error) => {
    console.error('Leveling database connection failed.', error);
});

function cooldownKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function onCooldown(guildId, userId, now) {
    const until = cooldowns.get(cooldownKey(guildId, userId));
    return typeof until === 'number' && until > now;
}

function markCooldown(guildId, userId, now) {
    cooldowns.set(cooldownKey(guildId, userId), now + XP_COOLDOWN_MS);
}

function clearCooldowns() {
    cooldowns.clear();
}

function rollXp() {
    return Math.floor(Math.random() * 9) + 1;
}

function levelingEnabled(config) {
    if (!config || !Array.isArray(config.LevelingCommandStatus)) return false;
    const status = config.LevelingCommandStatus.map((entry) => (entry ? entry.Status : undefined));
    return `${status}` === 'true';
}

function firstText(list, key) {
    if (!Array.isArray(list)) return '';
    for (const entry of list) {
        const value = entry && entry[key];
        if (typeof value === 'string' && value.trim()) return value;
    }
    return '';
}

function formatLevelMessage(template, message, level) {
    const source = template && template.trim() ? template : DEFAULT_LEVEL_MESSAGE;
    const username = message.author && message.author.username ? message.author.username : 'someone';
    const text = source
        .replace(/{userd}/gi, username)
        .replace(/{user}/gi, `<@${message.author.id}>`)
        .replace(/{level}/gi, `${level}`);
    return text.trim() || DEFAULT_LEVEL_MESSAGE.replace('{user}', `<@${message.author.id}>`).replace('{level}', `${level}`);
}

async function resolveChannel(guild, channelId, fallback) {
    if (channelId && guild && guild.channels) {
        const cached = guild.channels.cache && typeof guild.channels.cache.get === 'function'
            ? guild.channels.cache.get(channelId)
            : null;
        if (cached && typeof cached.send === 'function') return cached;
        if (typeof guild.channels.fetch === 'function') {
            try {
                const fetched = await guild.channels.fetch(channelId);
                if (fetched && typeof fetched.send === 'function') return fetched;
            } catch (error) {
                // The configured channel was deleted or is not visible.
            }
        }
    }
    if (fallback && typeof fallback.send === 'function') return fallback;
    return null;
}

// DisabledChannels still blocks /levels through command gates. This handler did not
// consult that list, so chatting in a disabled channel still grants XP.
async function awardMessageXp(message, options = {}) {
    if (!message || !message.guild || !message.guild.id) return { awarded: false, reason: 'dm' };
    if (!message.author || !message.author.id) return { awarded: false, reason: 'no-user' };
    if (message.author.bot) return { awarded: false, reason: 'bot' };

    const config = await getGuildConfig(message.guild.id);
    if (!levelingEnabled(config)) return { awarded: false, reason: 'disabled' };

    const now = options.now ?? Date.now();
    if (onCooldown(message.guild.id, message.author.id, now)) {
        return { awarded: false, reason: 'cooldown' };
    }

    const xp = options.xp ?? rollXp();
    const leveledUp = await Levels.appendXp(message.author.id, message.guild.id, xp);
    markCooldown(message.guild.id, message.author.id, now);

    let announced = false;
    let level = null;
    if (leveledUp) {
        const user = await Levels.fetch(message.author.id, message.guild.id);
        level = user ? user.level : Levels.levelForXp(xp);
        const channelId = firstText(config && config.Levelupchannel, 'Channel');
        const template = firstText(config && config.Levelupmessage, 'Message');
        const channel = await resolveChannel(message.guild, channelId, message.channel);
        if (channel) {
            await channel.send(formatLevelMessage(template, message, level));
            announced = true;
        }
    }

    return { awarded: true, xp, leveledUp, level, announced };
}

module.exports = {
    name: 'messageCreate',
    XP_COOLDOWN_MS,
    awardMessageXp,
    clearCooldowns,
    async execute(message) {
        try {
            return await awardMessageXp(message);
        } catch (error) {
            console.error('Leveling failed.', error);
            return { awarded: false, reason: 'error' };
        }
    },
};
