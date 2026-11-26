const { clearMute } = require('../../utils/mutes');
const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { getGuildConfig } = require('../../utils/getGuildConfig');
const mod = require('../../utils/moderation');
const { firstValue } = require('../../utils/configStatus');

function check(interaction) {
    const checked = mod.targetAndReason(interaction, PermissionFlagsBits.ManageRoles, { reason: false });
    if (checked.error) return checked;
    const raw = interaction.options.getString('reason');
    if (raw == null || !String(raw).trim()) return checked;
    const parsed = mod.reasonFrom(raw);
    return parsed.error ? { error: parsed.error } : { ...checked, reason: parsed.reason };
}

async function findRole(guild, roleId) {
    const cached = guild.roles && guild.roles.cache ? guild.roles.cache.get(roleId) : null;
    if (cached || !guild.roles || typeof guild.roles.fetch !== 'function') return cached || null;
    return guild.roles.fetch(roleId).catch(() => null);
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Removes the mute role from a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member to unmute.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Why the mute is ending. Optional.').setMaxLength(mod.REASON_MAX)),
        PermissionFlagsBits.ModerateMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/unmute target:@user reason:appealed',
    permissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ManageRoles],
    precheck: (interaction) => check(interaction).error || null,
    async execute(interaction, _client, deps = {}) {
        try {
            const checked = check(interaction);
            if (checked.error) return finishReply(interaction, mod.ephemeral(checked.error));
            const { target, reason } = checked;
            await mod.defer(interaction);
            const config = await (deps.getGuildConfig || getGuildConfig)(interaction.guild.id);
            const roleId = firstValue(config, 'Muterole', 'Role');
            if (!roleId) return mod.finish(interaction, mod.ephemeral('No mute role is set. Set one with /config section:Roles.'));
            // A deleted mute role must not stop an unmute: the stored mute is
            // still cleared. A role that is there has to be one Mika can remove.
            const role = await findRole(interaction.guild, roleId);
            const me = interaction.guild.members.me;
            if (role && me && me.roles && me.roles.highest && role.position >= me.roles.highest.position) {
                return mod.finish(interaction, mod.ephemeral("I can't remove that mute role because it is at or above my highest role."));
            }

            await clearMute(target, roleId);
            const outcome = await mod.logAction(interaction, {
                color: 'success', title: '🔊 Member unmuted', user: target, reason,
            });
            return mod.actionReply(interaction, {
                color: 'success',
                text: mod.actionText('✅', `<@${target.id}> was unmuted.`, reason),
                label: 'mute',
                mentionIds: [target.id],
                outcome,
            });
        } catch (error) {
            return mod.replyError(interaction, error, 'Unmute failed.');
        }
    },
};
