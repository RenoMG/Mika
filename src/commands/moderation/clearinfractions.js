const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('clearinfractions')
        .setDescription('Clears every stored infraction for a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member whose infractions to clear.').setRequired(true)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/clearinfractions target:@user',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers],
    async execute(interaction) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.KickMembers);
            if (block) return interaction.reply(mod.ephemeral(block));
            const guild = mod.snowflake(interaction.guildId);
            const user = mod.snowflake(target.id);
            if (!guild || !user) return interaction.reply(mod.ephemeral('That user id is not valid.'));
            await mod.hold(interaction);
            const existing = await mod.infractionsDB.findOne({ GuildID: guild, UserID: user });
            const warns = await mod.warnDB.findOne({ GuildID: guild, UserID: user });
            if (!existing && !warns) {
                return mod.answer(interaction, mod.embedReply(
                    mod.Colors.Blue,
                    `${target.user.tag} | ${target.id} | Has no infractions.`,
                    'Mika | 📜 infractions',
                    [target.id],
                ));
            }
            await mod.warnDB.findOneAndDelete({ GuildID: guild, UserID: user });
            await mod.infractionsDB.findOneAndDelete({ GuildID: guild, UserID: user });
            return mod.answer(interaction, mod.embedReply(
                mod.Colors.Green,
                `${target.user.tag}'s infractions were cleared. | ${target.id}`,
                'Mika | 📜 infractions',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Clear infractions failed.');
        }
    },
};
