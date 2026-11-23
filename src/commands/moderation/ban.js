const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member to ban.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the ban.').setRequired(true).setMaxLength(mod.REASON_MAX))
        .addStringOption((option) => option.setName('messages').setDescription('How much recent message history to delete.').setRequired(true)
            .addChoices({ name: "Don't delete any", value: '0' }, { name: 'Previous 7 days', value: '7' })),
        PermissionFlagsBits.BanMembers),
    category: 'moderation',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/ban target:@user reason:spamming messages:Don\'t delete any',
    permissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers],
    async execute(interaction) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.BanMembers);
            if (block) return interaction.reply(mod.ephemeral(block));

            const parsed = mod.reasonFrom(interaction.options.getString('reason'));
            if (parsed.error) return interaction.reply(mod.ephemeral(parsed.error));
            const days = interaction.options.getString('messages');
            if (days !== '0' && days !== '7') {
                return interaction.reply(mod.ephemeral('Choose how many days of messages to delete.'));
            }

            const reason = parsed.reason;
            await mod.hold(interaction);
            await target.ban({
                deleteMessageSeconds: Number(days) * 24 * 60 * 60,
                reason,
            });
            const doc = await mod.pushInfraction(interaction.guildId, target.id, 'Bans', mod.actorEntry(interaction, reason));
            await mod.sendModLog(interaction, {
                color: mod.Colors.Red,
                title: 'BAN',
                thumbnail: target.displayAvatarURL(),
                description: `**${target.user.username}** has been banned!`,
                lines: `• Banned by: ${interaction.user.tag}
                • ID: ${target.id}
                • Reason: ${reason}
                • Current number of bans: ${(doc.Bans || []).length}`,
                mentionIds: [target.id, interaction.user.id],
            });
            return mod.answer(interaction, mod.embedReply(
                mod.Colors.Red,
                `✅ **${target.user.username}** has been banned! | ${target.id}\n**Reason**: ${reason}`,
                'Mika | 🚫 ban',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Ban failed.');
        }
    },
};
