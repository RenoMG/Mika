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
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/kick target:@user reason:spamming',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers],
    async execute(interaction) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.KickMembers);
            if (block) return interaction.reply(mod.ephemeral(block));
            const parsed = mod.reasonFrom(interaction.options.getString('reason'));
            if (parsed.error) return interaction.reply(mod.ephemeral(parsed.error));

            const reason = parsed.reason;
            await mod.hold(interaction);
            await target.kick(reason);
            const doc = await mod.pushInfraction(interaction.guildId, target.id, 'Kicks', mod.actorEntry(interaction, reason));
            await mod.sendModLog(interaction, {
                color: mod.Colors.Red,
                title: 'KICK',
                thumbnail: target.displayAvatarURL(),
                description: `**${target.user.username}** has been kicked!`,
                lines: `• Kicked by: ${interaction.user.tag}
                • ID: ${target.id}
                • Reason: ${reason}
                • Current number of kicks: ${(doc.Kicks || []).length}`,
                mentionIds: [target.id, interaction.user.id],
            });
            return mod.answer(interaction, mod.embedReply(
                mod.Colors.Red,
                `✅ **${target.user.username}** has been kicked! | ${target.id}\n**Reason**: ${reason}`,
                'Mika | 👢 kick',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Kick failed.');
        }
    },
};
