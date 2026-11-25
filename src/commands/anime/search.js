const { componentReply } = require('../../utils/ack');
const { updateComponent } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
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
    async execute(interaction, _client, deps = {}) {
        await defer(interaction);
        const raw = interaction.options.getString('query');
        const plan = await (deps.planSearch || planSearch)(raw, deps.sources || { getAnime, searchAnime });
        if (plan.type === 'empty') return finish(interaction, ephemeral('Give me a title to search for.'));
        if (plan.type === 'blocked') return finish(interaction, ephemeral(BLOCKED));
        if (plan.type === 'missing') return finish(interaction, ephemeral("That anime isn't available right now."));
        if (plan.type === 'none') return finish(interaction, ephemeral('No anime matched that.'));
        if (plan.type === 'direct' || plan.type === 'exact') {
            const cached = Boolean(plan.media && plan.media.cached);
            const lookup = deps.getAnime || getAnime;
            const full = plan.type === 'direct' ? plan.media : ((await lookup(plan.media.id)) || plan.media);
            return finish(interaction, {
                embeds: [animeEmbed(full, { cached })],
                allowedMentions: allowedMentions(),
            });
        }

        const results = plan.results;

        const label = neutralize(raw, 80) || 'that title';
        const view = (disabled) => ({
            content: `🔎 Results for **${label}**. Pick one below.`,
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
                const chosen = (results || []).find((item) => item && String(item.id) === String(id));
                const media = id ? await getAnime(id) : null;
                if (!media) {
                    await componentReply(component, ephemeral("That anime isn't available right now."));
                    return false;
                }
                await updateComponent(component, {
                    content: null,
                    embeds: [animeEmbed(media, { cached: Boolean(chosen && chosen.cached) })],
                    components: [],
                    allowedMentions: allowedMentions(),
                });
                return true;
            },
        });
    },
};
