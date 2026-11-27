// Level roles: a role handed out when a member reaches a level. Roles stack, so
// someone at level 10 keeps the level 5 role and gains the level 10 one. Stored
// on the guild config as LevelRoles: [{ Level: '5', Role: '<id>' }].
const { roleAssignmentError } = require('./roles');
const { redact } = require('./redact');

const LEVEL_ROLES_MAX = 25;
const LEVEL_MIN = 1;
const LEVEL_MAX = 1000;

function parseLevel(value) {
    const text = String(value == null ? '' : value).trim();
    if (!/^\d{1,4}$/.test(text)) return null;
    const level = Number(text);
    return level >= LEVEL_MIN && level <= LEVEL_MAX ? level : null;
}

// Every valid reward, lowest level first. One role per level and one level per role;
// if a document somehow holds duplicates, the first one wins.
function levelRoles(config) {
    const list = config && Array.isArray(config.LevelRoles) ? config.LevelRoles : [];
    const levels = new Set();
    const roles = new Set();
    const rewards = [];
    for (const entry of list) {
        const level = parseLevel(entry && entry.Level);
        const roleId = entry && typeof entry.Role === 'string' && /^\d{17,20}$/.test(entry.Role) ? entry.Role : null;
        if (level == null || !roleId || levels.has(level) || roles.has(roleId)) continue;
        levels.add(level);
        roles.add(roleId);
        rewards.push({ level, roleId });
    }
    return rewards.sort((a, b) => a.level - b.level);
}

// The list after setting `roleId` at `level`: the level's old role and the
// role's old level are both replaced.
function withLevelRole(config, level, roleId) {
    const kept = levelRoles(config).filter((reward) => reward.level !== level && reward.roleId !== roleId);
    return [...kept, { level, roleId }].sort((a, b) => a.level - b.level);
}

function withoutLevelRoles(config, levels) {
    const drop = new Set(levels);
    return levelRoles(config).filter((reward) => !drop.has(reward.level));
}

function toStored(rewards) {
    return rewards.map((reward) => ({ Level: String(reward.level), Role: reward.roleId }));
}

function earnedRewards(config, level) {
    return levelRoles(config).filter((reward) => reward.level <= level);
}

function nextReward(config, level) {
    return levelRoles(config).find((reward) => reward.level > level) || null;
}

function roleOf(guild, roleId) {
    const cache = guild && guild.roles && guild.roles.cache;
    return cache && typeof cache.get === 'function' ? cache.get(roleId) || null : null;
}

function memberHas(member, roleId) {
    const cache = member && member.roles && member.roles.cache;
    return Boolean(cache && typeof cache.has === 'function' && cache.has(roleId));
}

// Adds every earned role the member is missing, skipping ones that were deleted
// or that Mika can no longer give (moved above her, or given risky permissions).
// Returns the roles added, lowest level first. Never throws.
async function grantLevelRoles(member, config, level, guild = member && member.guild) {
    if (!member || !member.roles || typeof member.roles.add !== 'function') return [];
    const missing = [];
    for (const reward of earnedRewards(config, level)) {
        if (memberHas(member, reward.roleId)) continue;
        const role = roleOf(guild, reward.roleId);
        if (!role || roleAssignmentError(guild, role, null)) continue;
        missing.push({ ...reward, role });
    }
    if (!missing.length) return [];
    try {
        await member.roles.add(missing.map((reward) => reward.roleId), `Reached level ${level}`);
        return missing;
    } catch (error) {
        console.error('Level role grant failed.', redact(error));
        return [];
    }
}

module.exports = {
    LEVEL_ROLES_MAX,
    LEVEL_MIN,
    LEVEL_MAX,
    parseLevel,
    levelRoles,
    withLevelRole,
    withoutLevelRoles,
    toStored,
    earnedRewards,
    nextReward,
    roleOf,
    grantLevelRoles,
};
