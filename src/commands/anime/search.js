const { SlashCommandBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { animeAutocomplete } = require('../../anime/autocomplete');
const { getAnime, searchAnime } = require('../../anime/client');
const { SEARCH_ID, buildSearchRow } = require('../../anime/components');
const { animeEmbed } = require('../../anime/embed');
const { anilistId, mediaId } = require('../../anime/ids');
const { pickTitle } = require('../../anime/match');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { BLOCKED, containsSlur, neutralize } = require('../../anime/text');

async function planSearch(raw, deps) {
    if (typeof raw !== 'string' || !raw.trim()) return { type: 'empty' };
    if (containsSlur(raw)) return { type: 'blocked' };
    const id = anilistId(raw.trim());
    if (id) {
        const media = await deps.getAnime(id);
        return media ? { type: 'direct', media } : { type: 'missing' };
    }
    const results = await deps.searchAnime(raw.trim());
    if (!results || !results.length) return { type: 'none' };
    const picked = pickTitle(raw, results);
    if (picked) return { type: 'exact', media: picked };
    return { type: 'picker', results };
}

module.exports = {
    planSearch,
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('search')
        .setDescription('Look up an anime by title.')
        .addStringOption((option) => option
            .setName('query')
            .setDescription('Title to look up. Pick a suggestion to open it.')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(100))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/search query:cowboy bebop',
    autocomplete: animeAutocomplete,
    async execute(interaction) {
        const raw = interaction.options.getString('query');
        const plan = await planSearch(raw, { getAnime, searchAnime });
        if (plan.type === 'empty') return interaction.reply(ephemeral('Give me a title to search for.'));
        if (plan.type === 'blocked') return interaction.reply(ephemeral(BLOCKED));
        if (plan.type === 'missing') return interaction.reply(ephemeral("That anime isn't available right now."));
        if (plan.type === 'none') return interaction.reply(ephemeral('No anime matched that.'));
        if (plan.type === 'direct' || plan.type === 'exact') {
            const full = plan.type === 'direct' ? plan.media : ((await getAnime(plan.media.id)) || plan.media);
            return interaction.reply({
                embeds: [animeEmbed(full)],
                allowedMentions: allowedMentions(),
            });
        }

        const results = plan.results;

        const label = neutralize(raw, 80) || 'that title';
        const view = (disabled) => ({
            content: `Results for **${label}**.`,
            components: buildSearchRow(results, { disabled }),
            allowedMentions: allowedMentions(),
        });
        const message = await replyMenu(interaction, view(false));
        watchMenu({
            message,
            interaction,
            commandName: 'search',
            disabledView: () => view(true),
            onCollect: async (component) => {
                if (component.customId !== SEARCH_ID) return false;
                const id = mediaId(component.values && component.values[0]);
                const media = id ? await getAnime(id) : null;
                if (!media) {
                    await component.reply(ephemeral("That anime isn't available right now."));
                    return false;
                }
                await component.update({
                    content: null,
                    embeds: [animeEmbed(media)],
                    components: [],
                    allowedMentions: allowedMentions(),
                });
                return true;
            },
        });
    },
};
