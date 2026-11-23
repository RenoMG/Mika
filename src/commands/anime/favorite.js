const { SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { animeAutocomplete, resolveAnime } = require('../../anime/autocomplete');
const {
    MAX_FAVORITES,
    addFavorite,
    applyFavorites,
    readFavorites,
    removeFavorite,
    reorderFavorites,
} = require('../../anime/favorites');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { SETUP_FIRST, getProfile } = require('../../anime/profiles');
const { neutralize } = require('../../anime/text');

function titled(title) {
    return neutralize(title, 200) || 'that anime';
}

function saved(profile, list) {
    applyFavorites(profile, list);
    return profile.save();
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('favorite')
        .setDescription('Add, remove, reorder, or clear your top 5 anime.')
        .addSubcommand((sub) => sub
            .setName('add')
            .setDescription('Add an anime to your top 5.')
            .addStringOption((option) => option
                .setName('anime')
                .setDescription('Search AniList, then pick one.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Remove an anime from your top 5.')
            .addStringOption((option) => option
                .setName('anime')
                .setDescription('Which favorite to remove.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('reorder')
            .setDescription('Move a favorite to a new spot.')
            .addIntegerOption((option) => option
                .setName('from')
                .setDescription('Current spot, from 1 to 5.')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(5))
            .addIntegerOption((option) => option
                .setName('to')
                .setDescription('New spot, from 1 to 5.')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(5)))
        .addSubcommand((sub) => sub
            .setName('clear')
            .setDescription('Clear your favorites list.'))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/favorite add anime:Cowboy Bebop',
    examples: {
        add: '/favorite add anime:Cowboy Bebop',
        remove: '/favorite remove anime:Cowboy Bebop',
        reorder: '/favorite reorder from:2 to:1',
        clear: '/favorite clear',
    },
    async autocomplete(interaction) {
        const sub = interaction.options && typeof interaction.options.getSubcommand === 'function'
            ? interaction.options.getSubcommand(false)
            : '';
        if (sub === 'remove') {
            const userId = snowflake(interaction.user && interaction.user.id);
            const profile = userId ? await getProfile(userId) : null;
            const focused = interaction.options.getFocused(true);
            const query = String(focused && focused.value || '').trim().toLowerCase();
            const choices = readFavorites(profile)
                .filter((item) => !query || item.title.toLowerCase().includes(query) || item.anilistId.includes(query))
                .slice(0, 25)
                .map((item) => ({ name: item.title.slice(0, 100), value: item.anilistId }));
            await interaction.respond(choices);
            return;
        }
        await animeAutocomplete(interaction);
    },
    async execute(interaction) {
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await getProfile(userId) : null;
        if (!profile) return interaction.reply(ephemeral(SETUP_FIRST));
        const sub = interaction.options.getSubcommand();

        if (sub === 'clear') {
            await saved(profile, []);
            return interaction.reply(ephemeral('Cleared your favorites.'));
        }

        if (sub === 'reorder') {
            const from = interaction.options.getInteger('from');
            const to = interaction.options.getInteger('to');
            const result = reorderFavorites(profile, from, to);
            if (!result.ok) {
                const message = readFavorites(profile).length < 2
                    ? 'Add at least two favorites before reordering.'
                    : 'Pick spots that are on your list.';
                return interaction.reply(ephemeral(message));
            }
            await saved(profile, result.list);
            return interaction.reply(ephemeral(`Moved **${titled(result.moved.title)}** to #${to}.`));
        }

        if (sub === 'remove') {
            const result = removeFavorite(profile, interaction.options.getString('anime'));
            if (!result.ok) return interaction.reply(ephemeral('That anime is not on your list.'));
            await saved(profile, result.list);
            return interaction.reply(ephemeral(`Removed **${titled(result.removed.title)}** from your favorites.`));
        }

        const media = await resolveAnime(interaction.options.getString('anime'));
        if (!media) {
            return interaction.reply(ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        const result = addFavorite(profile, media);
        if (!result.ok && result.reason === 'duplicate') {
            return interaction.reply(ephemeral(`**${titled(media && (media.titles && (media.titles.english || media.titles.romaji)))}** is already on your list.`));
        }
        if (result.reason === 'full') {
            return interaction.reply(ephemeral(`Your top ${MAX_FAVORITES} is full. Remove one with /favorite remove.`));
        }
        if (!result.ok) {
            return interaction.reply(ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        await saved(profile, result.list);
        const added = result.list[result.list.length - 1];
        return interaction.reply(ephemeral(`Added **${titled(added.title)}** to your favorites (${result.list.length}/${MAX_FAVORITES}).`));
    },
};
