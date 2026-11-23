const { SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { SETUP_FIRST, getProfile, noteIdentity } = require('../../anime/profiles');
const { BIO_MAX, sanitizeUserText } = require('../../anime/text');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('bio')
        .setDescription('Set the bio on your anime profile.')
        .addStringOption((option) => option
            .setName('text')
            .setDescription('A short bio.')
            .setRequired(true)
            .setMaxLength(BIO_MAX))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/bio text:I like mecha',
    async execute(interaction) {
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await getProfile(userId) : null;
        if (!profile) return interaction.reply(ephemeral(SETUP_FIRST));
        await noteIdentity(profile, interaction.user, interaction.member);
        const cleaned = sanitizeUserText(interaction.options.getString('text'), BIO_MAX);
        if (cleaned.error) return interaction.reply(ephemeral(cleaned.error));
        profile.bio = cleaned.text;
        await profile.save();
        return interaction.reply(ephemeral('Bio saved.'));
    },
};
