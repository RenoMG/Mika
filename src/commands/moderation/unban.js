const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { redact } = require('../../utils/redact');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unbans a user by ID.')
        .addStringOption((option) => option.setName('id').setDescription('Id of the banned user.').setRequired(true).setMinLength(17).setMaxLength(20))
        .addStringOption((option) => option.setName('reason').setDescription('Why the ban is ending. Optional.').setMaxLength(mod.REASON_MAX)),
        PermissionFlagsBits.BanMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/unban id:123456789012345678 reason:appeal accepted',
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
            const rawReason = interaction.options.getString('reason');
            const parsed = rawReason == null || !String(rawReason).trim() ? {} : mod.reasonFrom(rawReason);
            if (parsed.error) return finishReply(interaction, mod.ephemeral(parsed.error));
            const reason = parsed.reason || null;
            const me = interaction.guild.members.me;
            if (!me || !me.permissions.has(PermissionFlagsBits.BanMembers)) {
                return finishReply(interaction, mod.ephemeral(mod.HIERARCHY.botPermission));
            }

            let user;
            try {
                await mod.defer(interaction);
                user = await interaction.guild.members.unban(userId, reason || undefined);
            } catch (error) {
                console.error('Unban failed.', redact(error));
                return mod.finish(interaction, mod.ephemeral('That user is not banned, or I could not unban them.'));
            }

            const name = user && user.tag ? user.tag : userId;
            const outcome = await mod.logAction(interaction, {
                color: 'success', title: '🔓 User unbanned', user: user || { id: userId }, reason,
            });
            return mod.actionReply(interaction, {
                color: 'success',
                text: mod.actionText('✅', `**${name}** was unbanned.`, reason),
                label: 'ban',
                mentionIds: [userId],
                outcome,
            });
        } catch (error) {
            return mod.replyError(interaction, error, 'Unban failed.');
        }
    },
};
