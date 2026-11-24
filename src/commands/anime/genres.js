const { updateComponent } = require('../../utils/ack');
const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { getGenres, getTags } = require('../../anime/client');
const {
    GENRE_ID,
    GENRE_NEXT,
    GENRE_PREV,
    TAG_ID,
    applyTaste,
    buildTasteRows,
    capTaste,
    genreSlice,
    tasteSummary,
} = require('../../anime/components');
const { snowflake } = require('../../anime/ids');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { SETUP_FIRST, getProfile, noteIdentity } = require('../../anime/profiles');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('genres')
        .setDescription('Choose up to 10 genres and 10 tags.')),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/genres',
    async execute(interaction, _client, deps = {}) {
        await defer(interaction, { ephemeral: true });
        const userId = snowflake(interaction.user && interaction.user.id);
        const loadProfile = deps.getProfile || getProfile;
        const profile = userId ? await loadProfile(userId) : null;
        if (!profile) return finish(interaction, ephemeral(SETUP_FIRST));
        await (deps.noteIdentity || noteIdentity)(profile, interaction.user, interaction.member);

        const all = await (deps.getGenres || getGenres)();
        const tagList = await (deps.getTags || getTags)();
        if (!all.length) return finish(interaction, ephemeral("Couldn't load genres right now. Try again in a minute."));

        const knownGenres = new Set(all);
        const knownTags = new Set(tagList);
        const initial = capTaste(
            (Array.isArray(profile.genres) ? profile.genres : []).filter((name) => knownGenres.has(name)),
            (Array.isArray(profile.tags) ? profile.tags : []).filter((name) => knownTags.has(name)),
        );
        const state = { page: 0, genres: initial.genres, tags: initial.tags };
        const view = (disabled) => {
            const slice = genreSlice(all, state.page);
            return {
                content: tasteSummary(state.genres.length, state.tags.length, {
                    showTags: tagList.length > 0,
                    page: slice.page,
                    pages: slice.pages,
                }),
                components: buildTasteRows(all, tagList, state, { disabled }),
                allowedMentions: allowedMentions(),
            };
        };
        const message = await replyMenu(interaction, { ...view(false), flags: MessageFlags.Ephemeral });
        watchMenu({
            message,
            interaction,
            commandName: 'genres',
            disabledView: () => view(true),
            onCollect: async (component) => {
                if (component.customId === GENRE_PREV) state.page -= 1;
                else if (component.customId === GENRE_NEXT) state.page += 1;
                else if (component.customId === GENRE_ID || component.customId === TAG_ID) {
                    const page = component.customId === TAG_ID ? { names: tagList } : genreSlice(all, state.page);
                    const next = applyTaste(state, {
                        customId: component.customId,
                        pageNames: page.names,
                        picked: component.values || [],
                        genreNames: all,
                        tagNames: tagList,
                    });
                    if (!next) return false;
                    state.genres = next.genres;
                    state.tags = next.tags;
                    profile.genres = state.genres;
                    profile.tags = state.tags;
                    profile.markModified('genres');
                    profile.markModified('tags');
                    await profile.save();
                } else {
                    return false;
                }
                await updateComponent(component, view(false));
                return false;
            },
        });
    },
};
