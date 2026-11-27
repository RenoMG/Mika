const { AttachmentBuilder } = require('discord.js');
const Levels = require('../levels');
const cards = require('../utils/cards');
const { getGuildConfig } = require('../utils/getGuildConfig');
const { DEFAULT_LEVEL_MESSAGE, formatMessage, memberValues } = require('../utils/formatMessage');
const { channelIsDisabled, firstValue, isOn } = require('../utils/configStatus');
const { allowedMentions } = require('../utils/mentions');
const { grantLevelRoles, levelRoles, nextReward, roleOf } = require('../utils/levelRoles');

const XP_COOLDOWN_MS = 60 * 1000;
const COOLDOWN_SWEEP_MS = 60 * 1000;
const cooldowns = new Map();
let nextSweep = 0;

function cooldownKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function onCooldown(guildId, userId, now) {
    const until = cooldowns.get(cooldownKey(guildId, userId));
    return typeof until === 'number' && until > now;
}

// Expired entries are swept at most once a minute instead of on every message.
function markCooldown(guildId, userId, now) {
    cooldowns.set(cooldownKey(guildId, userId), now + XP_COOLDOWN_MS);
    if (now >= nextSweep) {
        nextSweep = now + COOLDOWN_SWEEP_MS;
        for (const [key, until] of cooldowns) {
            if (until <= now) cooldowns.delete(key);
        }
    }
    while (cooldowns.size > 10000) cooldowns.delete(cooldowns.keys().next().value);
}

function rollXp() {
    return Math.floor(Math.random() * 9) + 1;
}

function levelValues(message, level) {
    const values = memberValues(message && message.member, message && message.author);
    return { ...values, level: level == null ? '' : String(level) };
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
        const url = user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
        return typeof url === 'string' ? url : '';
    } catch (error) {
        return '';
    }
}

// The card shows a role as its name in its own color; Discord's "no color" is grey.
function roleBadge(role) {
    if (!role) return null;
    const color = typeof role.hexColor === 'string' && role.hexColor !== '#000000' ? role.hexColor : null;
    return { name: role.name || 'New role', color };
}

function rewardLine(granted) {
    if (!granted.length) return '';
    const roles = granted.map((reward) => `<@&${reward.roleId}>`).join(' ');
    return `\n🎁 ${granted.length === 1 ? 'New role' : 'New roles'} unlocked: ${roles}`;
}

async function levelUpPayload(message, text, jump) {
    const avatarURL = avatarUrlOf(message && message.author);
    if (!avatarURL || jump.from == null || jump.to == null) return text;
    try {
        const png = await cards.renderLevelUpCard({
            // The card is an image, not markdown, so it takes the plain name.
            displayName: (message.member && message.member.displayName)
                || message.author.globalName || message.author.username || 'someone',
            from: jump.from,
            to: jump.to,
            current: jump.user ? jump.user.cleanXp : 0,
            needed: jump.user ? jump.user.cleanNextLevelXp : 0,
            rewards: (jump.granted || []).map((reward) => roleBadge(reward.role)).filter(Boolean),
            next: jump.next || null,
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

function withMentions(payload, userId) {
    const mentions = allowedMentions(userId);
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return { ...payload, allowedMentions: mentions };
    }
    return { content: payload, allowedMentions: mentions };
}

// DisabledChannels still blocks /level through command gates. This handler did not
// consult that list, so chatting in a disabled channel still grants XP.
async function awardMessageXp(message, options = {}) {
    if (!message || !message.guild || !message.guild.id) return { awarded: false, reason: 'dm' };
    if (!message.author || !message.author.id) return { awarded: false, reason: 'no-user' };
    // These return before getGuildConfig and before any level upsert.
    if (message.webhookId) return { awarded: false, reason: 'webhook' };
    if (message.system || message.author.system) return { awarded: false, reason: 'system' };
    if (message.author.bot) return { awarded: false, reason: 'bot' };

    const now = options.now ?? Date.now();
    if (onCooldown(message.guild.id, message.author.id, now)) return { awarded: false, reason: 'cooldown' };
    // Reserve before the first await, including the config read.
    markCooldown(message.guild.id, message.author.id, now);
    let config;
    try { config = await getGuildConfig(message.guild.id, { readOnly: true }); }
    catch (error) { cooldowns.delete(cooldownKey(message.guild.id, message.author.id)); throw error; }
    if (!isOn(config, 'LevelingCommandStatus')) {
        cooldowns.delete(cooldownKey(message.guild.id, message.author.id));
        return { awarded: false, reason: 'disabled' };
    }
    // Restricted channels earn no XP, matching how they block /level.
    if (channelIsDisabled(config, message.channelId || (message.channel && message.channel.id))) {
        cooldowns.delete(cooldownKey(message.guild.id, message.author.id));
        return { awarded: false, reason: 'channel' };
    }

    const xp = options.xp ?? rollXp();
    // One write awards the xp and reports the totals, so a jump of more than one level can say 3 → 5.
    const award = await Levels.awardXp(message.author.id, message.guild.id, xp, { cooldownMs: XP_COOLDOWN_MS, now });
    if (award === null) return { awarded: false, reason: 'cooldown' };
    markCooldown(message.guild.id, message.author.id, now);

    const previousLevel = Levels.levelForXp(award.beforeXp);
    const currentLevel = Levels.levelForXp(award.afterXp);
    const leveledUp = currentLevel > previousLevel;
    // Every award tops up missing level roles, so members already past a level
    // when its role was added catch up the next time they chat.
    const granted = levelRoles(config).length
        ? await grantLevelRoles(message.member, config, currentLevel, message.guild)
        : [];
    let announced = false;
    let level = null;
    if (leveledUp) {
        level = currentLevel;
        const user = {
            cleanXp: award.afterXp - Levels.xpFor(level),
            cleanNextLevelXp: Levels.xpFor(level + 1) - Levels.xpFor(level),
        };
        const channelId = firstValue(config, 'Levelupchannel', 'Channel');
        const template = firstValue(config, 'Levelupmessage', 'Message');
        const channel = await resolveChannel(message.guild, channelId, message.channel);
        if (channel) {
            const text = formatLevelMessage(template, message, level) + rewardLine(granted);
            const upcoming = nextReward(config, level);
            const nextRole = upcoming && roleOf(message.guild, upcoming.roleId);
            const next = nextRole ? { level: upcoming.level, ...roleBadge(nextRole) } : null;
            const payload = await levelUpPayload(message, text, { from: previousLevel, to: level, user, granted, next });
            await channel.send(withMentions(payload, message.author.id));
            announced = true;
        }
    }

    return { awarded: true, xp, leveledUp, level, previousLevel, announced, granted: granted.map((reward) => reward.roleId) };
}

module.exports = {
    name: 'messageCreate',
    XP_COOLDOWN_MS,
    DEFAULT_LEVEL_MESSAGE,
    awardMessageXp,
    async execute(message) {
        try {
            return await awardMessageXp(message);
        } catch (error) {
            console.error('Leveling failed.', error);
            return { awarded: false, reason: 'error' };
        }
    },
};
