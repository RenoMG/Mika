const { defer, finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');
const menu = require('./menu/infractionsMenu');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('infractions')
        .setDescription('Shows a member\'s warns, kicks, mutes, and bans.')
        .addUserOption((option) => option.setName('target').setDescription('Member to look up. Defaults to you.')),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    replies: 'private',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/infractions target:@user',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers],
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('target') || interaction.user;
            const guild = mod.snowflake(interaction.guildId);
            const userId = mod.snowflake(user && user.id);
            if (!guild || !userId) return finishReply(interaction, mod.ephemeral('That user id is not valid.'));
            // A member's record is for the moderator, so the lookup is private.
            await defer(interaction, { ephemeral: true });
            const doc = await mod.infractionsDB.findOne({ GuildID: guild, UserID: userId });
            return menu.presentInfractions(interaction, { user, doc });
        } catch (error) {
            return mod.replyError(interaction, error, 'Infractions failed.');
        }
    },
};
