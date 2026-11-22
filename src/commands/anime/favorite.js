const { SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { animeAutocomplete, resolveAnime } = require('../../anime/autocomplete');
const { displayTitle } = require('../../anime/embed');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { SETUP_FIRST, getProfile } = require('../../anime/profiles');
const { neutralize } = require('../../anime/text');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('favorite')
        .setDescription('Set your favorite anime.')
        .addStringOption((option) => option
            .setName('anime')
            .setDescription('Search AniList, then pick one.')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(100))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/favorite anime:Cowboy Bebop',
    autocomplete: animeAutocomplete,
    async execute(interaction) {
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await getProfile(userId) : null;
        if (!profile) return interaction.reply(ephemeral(SETUP_FIRST));
        const media = await resolveAnime(interaction.options.getString('anime'));
        if (!media) {
            return interaction.reply(ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        profile.favoriteId = String(media.id);
        profile.favoriteTitle = neutralize(displayTitle(media), 200);
        await profile.save();
        return interaction.reply(ephemeral(`Favorite saved: ${profile.favoriteTitle}.`));
    },
};
