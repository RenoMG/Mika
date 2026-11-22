const HIERARCHY = {
    missing: 'That member is not in this server.',
    self: 'You cannot use this on yourself.',
    owner: 'You cannot use this on the server owner.',
    botRole: "I can't act on that member because their highest role is at or above mine.",
    invokerRole: "You can't act on a member whose highest role is at or above yours.",
    botPermission: "I don't have the right permission to do this command!",
};

function positionOf(member) {
    const position = member && member.roles && member.roles.highest
        ? member.roles.highest.position
        : 0;
    const number = Number(position);
    return Number.isFinite(number) ? number : 0;
}

function memberId(member) {
    if (!member) return '';
    if (member.id != null && typeof member.id !== 'object') return String(member.id);
    if (member.user && member.user.id != null && typeof member.user.id !== 'object') return String(member.user.id);
    return '';
}

// The server owner may act above their own role position. They still cannot
// target themselves, the check for the server owner as a target still holds,
// and the bot still cannot act above its own highest role.
function hierarchyBlock({ guild, invoker, target, botMember }) {
    if (!target || !memberId(target)) return HIERARCHY.missing;
    const targetId = memberId(target);
    const invokerId = memberId(invoker);
    if (invokerId && targetId === invokerId) return HIERARCHY.self;
    if (guild && guild.ownerId != null && targetId === String(guild.ownerId)) return HIERARCHY.owner;
    if (botMember && memberId(botMember) && targetId === memberId(botMember)) return HIERARCHY.botRole;
    if (botMember && positionOf(target) >= positionOf(botMember)) return HIERARCHY.botRole;
    const invokerIsOwner = Boolean(guild && invokerId && guild.ownerId != null && invokerId === String(guild.ownerId));
    if (!invokerIsOwner && positionOf(target) >= positionOf(invoker)) return HIERARCHY.invokerRole;
    return null;
}

module.exports = { HIERARCHY, hierarchyBlock, positionOf, memberId };
