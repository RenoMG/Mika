const { SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { SETUP_FIRST, getProfile } = require('../../anime/profiles');
const { WATCHING_MAX, sanitizeUserText } = require('../../anime/text');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('watching')
        .setDescription("Set what you're currently watching.")
        .addStringOption((option) => option
            .setName('title')
            .setDescription("The show you're watching.")
            .setRequired(true)
            .setMaxLength(WATCHING_MAX))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/watching title:Cowboy Bebop',
    async execute(interaction) {
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await getProfile(userId) : null;
        if (!profile) return interaction.reply(ephemeral(SETUP_FIRST));
        const cleaned = sanitizeUserText(interaction.options.getString('title'), WATCHING_MAX);
        if (cleaned.error) return interaction.reply(ephemeral(cleaned.error));
        profile.watching = cleaned.text;
        await profile.save();
        return interaction.reply(ephemeral('Currently watching saved.'));
    },
};
