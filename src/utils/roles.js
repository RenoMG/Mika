const { PermissionFlagsBits: P } = require('discord.js');
const DANGEROUS = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels,
    P.ManageWebhooks, P.BanMembers, P.KickMembers, P.ModerateMembers, P.MentionEveryone,
    P.ManageMessages, P.ManageNicknames, P.ManageEvents, P.ManageThreads, P.MoveMembers, P.MuteMembers, P.DeafenMembers, P.ViewAuditLog];
function roleAssignmentError(guild, role, actor, { requireManageRoles = false } = {}) {
    if (!role || !role.permissions || role.id === guild?.id || role.managed) return 'Choose an ordinary server role, not a managed role or @everyone.';
    if (DANGEROUS.some((permission) => role.permissions.has(permission))) return 'Auto-role and mute roles must not grant moderation or server-management permissions.';
    const me = guild?.members?.me;
    if (!me?.permissions?.has(P.ManageRoles) || !me.roles?.highest || role.comparePositionTo?.(me.roles.highest) >= 0
        || role.position >= me.roles.highest.position) return 'That role must be below my highest role.';
    if (actor) {
        if (requireManageRoles && !actor.permissions?.has(P.ManageRoles)) return 'You need Manage Roles to change this setting.';
        if (actor.id !== guild.ownerId && (!actor.roles?.highest || role.comparePositionTo?.(actor.roles.highest) >= 0
            || role.position >= actor.roles.highest.position)) return 'Choose a role below your highest role.';
    }
    return null;
}
module.exports = { roleAssignmentError };
