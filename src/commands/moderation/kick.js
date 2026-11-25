const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kicks a member.')
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
            const record = await mod.followThrough('Kick record failed.', async () => {
                const doc = await mod.pushInfraction(interaction.guildId, target.id, 'Kicks', mod.actorEntry(interaction, reason));
                await mod.sendModLog(interaction, {
                    color: 'danger',
                    title: '👢 Member kicked',
                    thumbnail: target.displayAvatarURL(),
                    targetId: target.id,
                    fields: [
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Total kicks', value: String((doc.Kicks || []).length) },
                    ],
                    mentionIds: [target.id, interaction.user.id],
                });
            });
            const text = mod.actionText('✅', `<@${target.id}> was kicked.`, reason);
            return mod.finish(interaction, mod.embedReply(
                'danger',
                record.failed ? `${text}\n${mod.RECORD_FAILED}` : text,
                'kick',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Kick failed.');
        }
    },
};
