const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { redact } = require('../../utils/redact');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unbans a user by id.')
        .addStringOption((option) => option.setName('id').setDescription('Id of the banned user.').setRequired(true).setMinLength(17).setMaxLength(20)),
        PermissionFlagsBits.BanMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/unban id:123456789012345678',
    permissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers],
    async execute(interaction) {
        try {
            const userId = mod.snowflake(interaction.options.getString('id'));
            if (!userId) return finishReply(interaction, mod.ephemeral('Give the id of a banned user.'));
            if (userId === String(interaction.user.id)) return finishReply(interaction, mod.ephemeral(mod.HIERARCHY.self));
            if (interaction.guild.ownerId && userId === String(interaction.guild.ownerId)) {
                return finishReply(interaction, mod.ephemeral(mod.HIERARCHY.owner));
            }
            const me = interaction.guild.members.me;
            if (!me || !me.permissions.has(PermissionFlagsBits.BanMembers)) {
                return finishReply(interaction, mod.ephemeral(mod.HIERARCHY.botPermission));
            }

            let user;
            try {
                await mod.defer(interaction);
                user = await interaction.guild.members.unban(userId);
            } catch (error) {
                console.error('Unban failed.', redact(error));
                return mod.finish(interaction, mod.ephemeral('That user is not banned, or I could not unban them.'));
            }

            const name = user && user.tag ? user.tag : userId;
            await mod.sendModLog(interaction, {
                color: 'success',
                title: '🔓 Member unbanned',
                targetId: userId,
                fields: [
                ],
                mentionIds: [userId, interaction.user.id],
            });
            return mod.finish(interaction, mod.embedReply(
                'success',
                mod.actionText('✅', `**${name}** was unbanned.`),
                'ban',
                [userId],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Unban failed.');
        }
    },
};
