const { clearMute } = require('../../utils/mutes');
const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { getGuildConfig } = require('../../utils/getGuildConfig');
const mod = require('../../utils/moderation');

function firstRoleId(list) {
    if (!Array.isArray(list)) return '';
    for (const entry of list) {
        if (entry && typeof entry.Role === 'string' && entry.Role) return entry.Role;
    }
    return '';
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Removes the mute role from a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member to unmute.').setRequired(true)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/unmute target:@user',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.ManageRoles],
    async execute(interaction, _client, deps = {}) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.ManageRoles);
            if (block) return finishReply(interaction, mod.ephemeral(block));
            await mod.hold(interaction);
            const config = await (deps.getGuildConfig || getGuildConfig)(interaction.guild.id);
            const roleId = firstRoleId(config.Muterole);
            if (!roleId) return mod.answer(interaction, mod.ephemeral('No mute role is set. Set one with /config muterole.'));
            const role = interaction.guild.roles.cache.get(roleId);
            const me = interaction.guild.members.me;
            if (role && me && me.roles && me.roles.highest && role.position >= me.roles.highest.position) {
                return mod.answer(interaction, mod.ephemeral("I can't assign that mute role because it is at or above my highest role."));
            }

            await clearMute(target, roleId);
            const doc = await mod.findByMember(mod.infractionsDB, interaction.guildId, target.id);
            await mod.sendModLog(interaction, {
                color: mod.Colors.Green,
                title: '🔊 Member unmuted',
                thumbnail: target.displayAvatarURL(),
                targetId: target.id,
                fields: [
                    { name: 'Total mutes', value: String(doc && Array.isArray(doc.Mutes) ? doc.Mutes.length : 0) },
                ],
                mentionIds: [target.id, interaction.user.id],
            });
            return mod.answer(interaction, mod.embedReply(
                mod.Colors.Green,
                mod.actionText('✅', `<@${target.id}> was unmuted.`),
                'mute',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Unmute failed.');
        }
    },
};
