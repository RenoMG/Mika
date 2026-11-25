const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('clearwarns')
        .setDescription('Clears the warning list for a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member whose warnings to clear.').setRequired(true)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/clearwarns target:@user',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers],
    async execute(interaction) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.KickMembers);
            if (block) return finishReply(interaction, mod.ephemeral(block));
            const guild = mod.snowflake(interaction.guildId);
            const user = mod.snowflake(target.id);
            if (!guild || !user) return finishReply(interaction, mod.ephemeral('That user id is not valid.'));
            await mod.hold(interaction);
            const existing = await mod.warnDB.findOne({ GuildID: guild, UserID: user });
            if (!existing) {
                return mod.answer(interaction, mod.embedReply(
                    mod.Colors.Blue,
                    `<@${target.id}> has no warnings.`,
                    'warn',
                    [target.id],
                ));
            }
            await mod.warnDB.findOneAndDelete({ GuildID: guild, UserID: user });
            return mod.answer(interaction, mod.embedReply(
                mod.Colors.Green,
                mod.actionText('✅', `Cleared all warnings for <@${target.id}>.`),
                'warn',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Clear warns failed.');
        }
    },
};
