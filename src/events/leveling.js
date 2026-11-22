const { AttachmentBuilder } = require('discord.js');
const Levels = require('../levels');
const cards = require('../utils/cards');
const { getGuildConfig } = require('../utils/getGuildConfig');
const { DEFAULT_LEVEL_MESSAGE, formatMessage } = require('../utils/formatMessage');

const XP_COOLDOWN_MS = 60 * 1000;
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

function levelValues(message, level) {
    const author = message && message.author ? message.author : {};
    const userd = (message && message.member && message.member.displayName)
        || author.globalName
        || author.username
        || 'someone';
    const user = author.id ? `<@${author.id}>` : userd;
    return { user, userd, level: level == null ? '' : String(level) };
}

function formatLevelMessage(template, message, level) {
    const values = levelValues(message, level);
    const source = template && String(template).trim() ? template : DEFAULT_LEVEL_MESSAGE;
    const text = formatMessage(source, values).trim();
    if (text) return text;
    return formatMessage(DEFAULT_LEVEL_MESSAGE, values);
}

function avatarUrlOf(user) {
    if (!user || typeof user.displayAvatarURL !== 'function') return '';
    try {
        const url = user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
        return typeof url === 'string' ? url : '';
    } catch (error) {
        return '';
    }
}

async function levelUpPayload(message, text, jump) {
    const avatarURL = avatarUrlOf(message && message.author);
    if (!avatarURL || jump.from == null || jump.to == null) return text;
    try {
        const png = await cards.renderLevelUpCard({
            displayName: levelValues(message, jump.to).userd,
            from: jump.from,
            to: jump.to,
            current: jump.user ? jump.user.cleanXp : 0,
            needed: jump.user ? jump.user.cleanNextLevelXp : 0,
            avatarURL,
        });
        return {
            content: text,
            files: [new AttachmentBuilder(png, { name: 'level-up.png' })],
        };
    } catch (error) {
        console.error('Level-up card failed.', error);
        return text;
    }
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
    // Read the level first so a jump of more than one level can say 3 → 5.
    const before = await Levels.fetch(message.author.id, message.guild.id);
    const previousLevel = before ? before.level : 0;
    const beforeXp = before ? before.xp : 0;
    const leveledUp = await Levels.appendXp(message.author.id, message.guild.id, xp);
    markCooldown(message.guild.id, message.author.id, now);

    let announced = false;
    let level = null;
    if (leveledUp) {
        const user = await Levels.fetch(message.author.id, message.guild.id);
        level = user ? user.level : Levels.levelForXp(beforeXp + xp);
        const channelId = firstText(config && config.Levelupchannel, 'Channel');
        const template = firstText(config && config.Levelupmessage, 'Message');
        const channel = await resolveChannel(message.guild, channelId, message.channel);
        if (channel) {
            const text = formatLevelMessage(template, message, level);
            await channel.send(await levelUpPayload(message, text, { from: previousLevel, to: level, user }));
            announced = true;
        }
    }

    return { awarded: true, xp, leveledUp, level, previousLevel, announced };
}

module.exports = {
    name: 'messageCreate',
    XP_COOLDOWN_MS,
    DEFAULT_LEVEL_MESSAGE,
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
