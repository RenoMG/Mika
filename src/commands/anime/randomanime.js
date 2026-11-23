const { SlashCommandBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { CURATED_TAGS, peekGenres, peekTags, randomAnime } = require('../../anime/client');
const { REROLL_ID, rerollRow } = require('../../anime/components');
const { animeEmbed } = require('../../anime/embed');
const { snowflake } = require('../../anime/ids');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { getProfile } = require('../../anime/profiles');
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
        .setDescription('Roll a random anime. Uses your genres and tags unless you pick some.')
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
    checkDisabledChannels: true,
    example: '/randomanime genre:Mecha tag:Isekai',
    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true);
        const text = focused && focused.value;
        const tags = focused && focused.name === 'tag';
        const live = await (tags ? peekTags() : peekGenres());
        const names = live && live.length ? live : (tags ? CURATED_TAGS : ANILIST_GENRES);
        await interaction.respond(filterChoices(names, text));
    },
    async execute(interaction) {
        const genre = interaction.options.getString('genre');
        const tag = interaction.options.getString('tag');
        const picked = (typeof genre === 'string' && genre.trim()) || (typeof tag === 'string' && tag.trim());
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = !picked && userId ? await getProfile(userId) : null;
        const filters = resolveRandomFilters({
            genre,
            tag,
            profile,
            genres: (await peekGenres()) || undefined,
            tags: (await peekTags()) || undefined,
        });
        if (filters.error) return interaction.reply(ephemeral(filters.error));

        const first = await randomAnime({ genres: filters.genres, tags: filters.tags });
        if (!first.ok || !first.media) return interaction.reply(miss(first));

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
                const next = await randomAnime({ genres: filters.genres, tags: filters.tags });
                if (!next.ok || !next.media) {
                    await component.reply(miss(next));
                    return false;
                }
                current = next.media;
                await component.update(view(false));
                return false;
            },
        });
    },
};
