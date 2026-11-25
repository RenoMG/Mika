const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warns a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member to warn.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the warning.').setRequired(true).setMaxLength(mod.REASON_MAX)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/warn target:@user reason:spamming',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers],
    async execute(interaction) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.KickMembers);
            if (block) return finishReply(interaction, mod.ephemeral(block));
            const parsed = mod.reasonFrom(interaction.options.getString('reason'));
            if (parsed.error) return finishReply(interaction, mod.ephemeral(parsed.error));

            const reason = parsed.reason;
            const entry = mod.actorEntry(interaction, reason);
            await mod.hold(interaction);
            await mod.pushWarn(interaction.guildId, target.id, entry);
            const doc = await mod.pushInfraction(interaction.guildId, target.id, 'Warns', entry);
            await mod.sendModLog(interaction, {
                color: mod.Colors.Yellow,
                title: '⚠️ Member warned',
                thumbnail: target.displayAvatarURL(),
                targetId: target.id,
                fields: [
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Total warns', value: String((doc.Warns || []).length) },
                ],
                mentionIds: [target.id, interaction.user.id],
            });
            return mod.answer(interaction, mod.embedReply(
                mod.Colors.Yellow,
                mod.actionText('✅', `<@${target.id}> was warned.`, reason),
                'warn',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Warn failed.');
        }
    },
};
