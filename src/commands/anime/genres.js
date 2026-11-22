const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { getGenres } = require('../../anime/client');
const { GENRE_ID, GENRE_NEXT, GENRE_PREV, MAX_GENRES, buildGenreRows, mergeGenres, genreSlice } = require('../../anime/components');
const { snowflake } = require('../../anime/ids');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { SETUP_FIRST, getProfile } = require('../../anime/profiles');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('genres')
        .setDescription('Choose your favorite genres.')),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/genres',
    async execute(interaction) {
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await getProfile(userId) : null;
        if (!profile) return interaction.reply(ephemeral(SETUP_FIRST));

        const all = await getGenres();
        if (!all.length) return interaction.reply(ephemeral("Couldn't load genres right now. Try again in a minute."));

        const known = new Set(all);
        const state = {
            page: 0,
            selected: (Array.isArray(profile.genres) ? profile.genres : []).filter((name) => known.has(name)).slice(0, MAX_GENRES),
        };
        const view = (disabled) => ({
            content: `Pick up to ${MAX_GENRES} genres. Page ${genreSlice(all, state.page).page + 1} of ${genreSlice(all, state.page).pages}.`,
            components: buildGenreRows(all, state.page, state.selected, { disabled }),
            allowedMentions: allowedMentions(),
        });
        const message = await replyMenu(interaction, { ...view(false), flags: MessageFlags.Ephemeral });
        watchMenu({
            message,
            interaction,
            commandName: 'genres',
            disabledView: () => view(true),
            onCollect: async (component) => {
                if (component.customId === GENRE_PREV) state.page -= 1;
                else if (component.customId === GENRE_NEXT) state.page += 1;
                else if (component.customId === GENRE_ID) {
                    const page = genreSlice(all, state.page);
                    const picked = (component.values || []).filter((name) => known.has(name));
                    state.selected = mergeGenres(state.selected, page.names, picked);
                    profile.genres = state.selected;
                    profile.markModified('genres');
                    await profile.save();
                } else {
                    return false;
                }
                await component.update(view(false));
                return false;
            },
        });
    },
};
