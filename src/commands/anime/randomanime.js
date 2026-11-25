const { componentReply } = require('../../utils/ack');
const { updateComponent } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { CURATED_TAGS, peekGenres, peekTags, randomAnime } = require('../../anime/client');
const { REROLL_ID, rerollRow } = require('../../anime/components');
const { animeEmbed } = require('../../anime/embed');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { respondWithin } = require('../../anime/autocomplete');
const {
    ANILIST_GENRES,
    RANDOM_DOWN,
    RANDOM_EMPTY,
    filterChoices,
    resolveRandomFilters,
} = require('../../anime/random');

function miss(result) {
    return ephemeral(result && result.empty ? RANDOM_EMPTY : RANDOM_DOWN);
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('randomanime')
        .setDescription('Roll a random well-rated anime, optionally from one genre or tag.')
        .addStringOption((option) => option
            .setName('genre')
            .setDescription('Limit this roll to one genre.')
            .setAutocomplete(true)
            .setMaxLength(50))
        .addStringOption((option) => option
            .setName('tag')
            .setDescription('Limit this roll to one tag.')
            .setAutocomplete(true)
            .setMaxLength(80))),
    category: 'anime',
    configKey: 'AnimeCommandStatus',
    replies: 'public',
    checkDisabledChannels: true,
    example: '/randomanime genre:Mecha tag:Isekai',
    async autocomplete(interaction, deps = {}) {
        const focused = interaction.options.getFocused(true);
        const text = focused && focused.value;
        const tags = focused && focused.name === 'tag';
        const fallbackNames = tags ? CURATED_TAGS : ANILIST_GENRES;
        const peek = tags ? (deps.peekTags || peekTags) : (deps.peekGenres || peekGenres);
        await respondWithin(interaction, async () => {
            const live = await peek();
            const names = live && live.length ? live : fallbackNames;
            return filterChoices(names, text);
        }, () => filterChoices(fallbackNames, text));
    },
    async execute(interaction, _client, deps = {}) {
        await defer(interaction);
        const genre = interaction.options.getString('genre');
        const tag = interaction.options.getString('tag');
        const genresOf = deps.peekGenres || peekGenres;
        const tagsOf = deps.peekTags || peekTags;
        const roll = deps.randomAnime || randomAnime;
        const filters = resolveRandomFilters({
            genre,
            tag,
            genres: (await genresOf()) || undefined,
            tags: (await tagsOf()) || undefined,
        });
        if (filters.error) return finish(interaction, ephemeral(filters.error));

        const first = await roll({ genres: filters.genres, tags: filters.tags });
        if (!first.ok || !first.media) return finish(interaction, miss(first));

        let current = first.media;
        const view = (disabled) => ({
            embeds: [animeEmbed(current, { cached: Boolean(current && current.cached) })],
            components: [rerollRow(disabled)],
            allowedMentions: allowedMentions(),
        });
        const message = await replyMenu(interaction, view(false));
        watchMenu({
            message,
            interaction,
            commandName: 'randomanime',
            disabledView: () => view(true),
            onCollect: async (component) => {
                if (component.customId !== REROLL_ID) return false;
                const next = await roll({ genres: filters.genres, tags: filters.tags });
                if (!next.ok || !next.media) {
                    await componentReply(component, miss(next));
                    return false;
                }
                current = next.media;
                await updateComponent(component, view(false));
                return false;
            },
        });
    },
};
