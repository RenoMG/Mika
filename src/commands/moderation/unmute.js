const { clearMute } = require('../../utils/mutes');
const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { getGuildConfig } = require('../../utils/getGuildConfig');
const mod = require('../../utils/moderation');
const { firstValue } = require('../../utils/configStatus');


module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Removes the mute role from a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member to unmute.').setRequired(true)),
        PermissionFlagsBits.ModerateMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/unmute target:@user',
    permissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ManageRoles],
    precheck: (interaction) => mod.targetAndReason(interaction, PermissionFlagsBits.ManageRoles, { reason: false }).error || null,
    async execute(interaction, _client, deps = {}) {
        try {
            const checked = mod.targetAndReason(interaction, PermissionFlagsBits.ManageRoles, { reason: false });
            if (checked.error) return finishReply(interaction, mod.ephemeral(checked.error));
            const { target } = checked;
            await mod.defer(interaction);
            const config = await (deps.getGuildConfig || getGuildConfig)(interaction.guild.id);
            const roleId = firstValue(config, 'Muterole', 'Role');
            if (!roleId) return mod.finish(interaction, mod.ephemeral('No mute role is set. Set one with /config section:Roles.'));
            const role = interaction.guild.roles.cache.get(roleId);
            const me = interaction.guild.members.me;
            if (role && me && me.roles && me.roles.highest && role.position >= me.roles.highest.position) {
                return mod.finish(interaction, mod.ephemeral("I can't assign that mute role because it is at or above my highest role."));
            }

            await clearMute(target, roleId);
            const doc = await mod.findByMember(mod.infractionsDB, interaction.guildId, target.id);
            await mod.sendModLog(interaction, {
                color: 'success',
                title: '🔊 Member unmuted',
                thumbnail: target.displayAvatarURL(),
                targetId: target.id,
                fields: [
                    { name: 'Total mutes', value: String(doc && Array.isArray(doc.Mutes) ? doc.Mutes.length : 0) },
                ],
                mentionIds: [target.id, interaction.user.id],
            });
            return mod.finish(interaction, mod.embedReply(
                'success',
                mod.actionText('✅', `<@${target.id}> was unmuted.`),
                'mute',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Unmute failed.');
        }
    },
};
