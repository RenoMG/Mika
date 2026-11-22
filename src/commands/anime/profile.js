const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { ephemeral } = require('../../anime/menu');
const { profileForViewer } = require('../../anime/profiles');
const { profileEmbed } = require('../../anime/profileView');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('profile')
        .setDescription("View your anime profile, or another user's.")
        .addUserOption((option) => option.setName('target').setDescription('Whose profile to view. Defaults to you.'))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/profile target:@user',
    async execute(interaction) {
        const target = interaction.options.getUser('target') || interaction.user;
        const decision = await profileForViewer(target && target.id, interaction.user && interaction.user.id);
        if (!decision.show) return interaction.reply(ephemeral(decision.message));
        const view = profileEmbed(decision.profile, target, { self: decision.self });
        return interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
    },
};
