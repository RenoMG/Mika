const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warns a member and adds it to their record.')
        .addUserOption((option) => option.setName('target').setDescription('Member to warn.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the warning.').setRequired(true).setMaxLength(mod.REASON_MAX)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/warn target:@user reason:spamming',
    permissions: [PermissionFlagsBits.KickMembers],
    // A warning is only a record, so the bot needs no Discord permission for it.
    botPermissions: [],
    precheck: (interaction) => mod.targetAndReason(interaction, null).error || null,
    async execute(interaction) {
        try {
            const checked = mod.targetAndReason(interaction, null);
            if (checked.error) return finishReply(interaction, mod.ephemeral(checked.error));
            const { target, reason } = checked;
            const entry = mod.actorEntry(interaction, reason);
            await mod.defer(interaction);
            await mod.pushWarn(interaction.guildId, target.id, entry);
            const doc = await mod.pushInfraction(interaction.guildId, target.id, 'Warns', entry);
            await mod.sendModLog(interaction, {
                color: 'warning',
                title: '⚠️ Member warned',
                thumbnail: target.displayAvatarURL(),
                targetId: target.id,
                fields: [
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Total warns', value: String((doc.Warns || []).length) },
                ],
                mentionIds: [target.id, interaction.user.id],
            });
            return mod.finish(interaction, mod.embedReply(
                'warning',
                mod.actionText('✅', `<@${target.id}> was warned.`, reason),
                'warn',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Warn failed.');
        }
    },
};
