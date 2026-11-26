const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kicks a member from the server.')
        .addUserOption((option) => option.setName('target').setDescription('Member to kick.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the kick.').setRequired(true).setMaxLength(mod.REASON_MAX)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/kick target:@user reason:spamming',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers],
    precheck: (interaction) => mod.targetAndReason(interaction, PermissionFlagsBits.KickMembers).error || null,
    async execute(interaction) {
        try {
            const checked = mod.targetAndReason(interaction, PermissionFlagsBits.KickMembers);
            if (checked.error) return finishReply(interaction, mod.ephemeral(checked.error));
            const { target, reason } = checked;

            await mod.defer(interaction);
            await target.kick(reason);
            const outcome = await mod.recordAction(interaction, {
                type: 'kick', user: target, reason, color: 'danger', title: '👢 Member kicked',
            });
            return mod.actionReply(interaction, {
                color: 'danger',
                text: mod.actionText('✅', `<@${target.id}> was kicked.`, reason),
                label: 'kick',
                mentionIds: [target.id],
                outcome,
            });
        } catch (error) {
            return mod.replyError(interaction, error, 'Kick failed.');
        }
    },
};
