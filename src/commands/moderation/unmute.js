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
    async execute(interaction) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.ManageRoles);
            if (block) return interaction.reply(mod.ephemeral(block));
            const config = await getGuildConfig(interaction.guild.id);
            const roleId = firstRoleId(config.Muterole);
            if (!roleId) return interaction.reply(mod.ephemeral('No mute role is set. Set one with /config muterole.'));
            const role = interaction.guild.roles.cache.get(roleId);
            const me = interaction.guild.members.me;
            if (role && me && me.roles && me.roles.highest && role.position >= me.roles.highest.position) {
                return interaction.reply(mod.ephemeral("I can't assign that mute role because it is at or above my highest role."));
            }

            await target.roles.remove(roleId);
            const doc = await mod.findByMember(mod.infractionsDB, interaction.guildId, target.id);
            await mod.sendModLog(interaction, {
                color: mod.Colors.Green,
                title: 'UNMUTE',
                thumbnail: target.displayAvatarURL(),
                description: `**${target.user.username}** has been unmuted!`,
                lines: `• Unmuted by: ${interaction.user.tag}
                • ID: ${target.id}
                • Current number of mutes: ${doc && Array.isArray(doc.Mutes) ? doc.Mutes.length : 0}`,
                mentionIds: [target.id, interaction.user.id],
            });
            return interaction.reply(mod.embedReply(
                mod.Colors.Green,
                `✅ **${target.user.username}** has been unmuted! | ${target.id}`,
                'Mika | 🤫 mute',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Unmute failed.');
        }
    },
};
