const { componentReply } = require('../../utils/ack');
const { updateComponent } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { animeAutocomplete, isCurrent, respondWithin } = require('../../anime/autocomplete');
const { anilistWaitMs, getAnime, getEntity, peekEntities, searchAnime, searchEntities } = require('../../anime/client');
const { SEARCH_ID, buildSearchRow } = require('../../anime/components');
const { animeEmbed, characterEmbed, studioEmbed } = require('../../anime/embed');
const { anilistId, mediaId } = require('../../anime/ids');
const { normalizeTitle, pickTitle } = require('../../anime/match');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { BLOCKED, containsSlur, neutralize } = require('../../anime/text');

const ENTITY_PICK = 'search:entity';
const COALESCE_MS = 150;
const KINDS = Object.freeze({
    character: { label: 'character', embed: characterEmbed },
    studio: { label: 'studio', embed: studioEmbed },
});

// Character and studio search. A suggestion's value is its AniList id.
async function entityAutocomplete(interaction, kind, deps = {}) {
    await respondWithin(interaction, async () => {
        const focused = interaction.options.getFocused(true);
        const query = String(focused && focused.value || '').trim();
        if (query.length < 2 || containsSlur(query)) return [];
        let found = (deps.peekEntities || peekEntities)(kind, query);
        if (!found) {
            await new Promise((resolve) => setTimeout(resolve, deps.coalesceMs ?? COALESCE_MS));
            if (!isCurrent(interaction)) return [];
            if ((deps.anilistWaitMs || anilistWaitMs)() > 1500) return [];
            found = await (deps.searchEntities || searchEntities)(kind, query, { timeoutMs: 1800 });
        }
        return (found || []).slice(0, 25)
            .map((item) => ({ name: neutralize(item.name, 100) || 'Unknown', value: item.id }))
            .filter((choice) => choice.name);
    }, []);
}

async function searchEntity(interaction, kind, raw, deps = {}) {
    const info = KINDS[kind];
    const get = deps.getEntity || getEntity;
    const id = anilistId(raw.trim());
    if (id) {
        const detail = await get(kind, id);
        if (!detail) return finish(interaction, ephemeral(`That ${info.label} isn't available right now.`));
        return finish(interaction, { embeds: [info.embed(detail)], allowedMentions: allowedMentions() });
    }
    const results = await (deps.searchEntities || searchEntities)(kind, raw.trim(), { timeoutMs: 8000 });
    if (!results || !results.length) return finish(interaction, ephemeral(`No ${info.label} matched that.`));
    const wanted = normalizeTitle(raw);
    const exact = results.filter((item) => normalizeTitle(item.name) === wanted);
    const only = results.length === 1 ? results[0] : (exact.length === 1 ? exact[0] : null);
    if (only) {
        const detail = await get(kind, only.id);
        if (!detail) return finish(interaction, ephemeral(`That ${info.label} isn't available right now.`));
        return finish(interaction, { embeds: [info.embed(detail)], allowedMentions: allowedMentions() });
    }
    const view = (disabled) => ({
        content: `🔎 ${info.label[0].toUpperCase()}${info.label.slice(1)}s matching **${neutralize(raw, 80) || 'that'}**. Pick one below.`,
        components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(ENTITY_PICK)
            .setPlaceholder(`Choose a ${info.label}`)
            .setDisabled(disabled)
            .addOptions(results.slice(0, 10).map((item) => ({
                label: (neutralize(item.name, 100) || 'Unknown').slice(0, 100),
                value: item.id,
            }))))],
        allowedMentions: allowedMentions(),
    });
    const message = await replyMenu(interaction, view(false));
    return watchMenu({
        message,
        interaction,
        commandName: 'search',
        disabledView: () => view(true),
        onCollect: async (component) => {
            if (component.customId !== ENTITY_PICK) return false;
            const picked = anilistId(component.values && component.values[0]);
            const detail = picked && results.some((item) => item.id === picked) ? await get(kind, picked) : null;
            if (!detail) {
                await componentReply(component, ephemeral(`That ${info.label} isn't available right now.`));
                return false;
            }
            await updateComponent(component, { content: null, embeds: [info.embed(detail)], components: [], allowedMentions: allowedMentions() });
            return true;
        },
    });
}

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
        .setDescription('Look up an anime, character, or studio on AniList.')
        .addStringOption((option) => option
            .setName('query')
            .setDescription('What to look up. Pick a suggestion to open it.')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(100))
        .addStringOption((option) => option
            .setName('type')
            .setDescription('What kind of thing. Defaults to anime. Pick this first for matching suggestions.')
            .addChoices(
                { name: 'Anime', value: 'anime' },
                { name: 'Character', value: 'character' },
                { name: 'Studio', value: 'studio' },
            ))),
    category: 'anime',
    configKey: 'AnimeCommandStatus',
    replies: 'public',
    checkDisabledChannels: true,
    example: '/search query:cowboy bebop',
    async autocomplete(interaction, deps = {}) {
        const kind = typeof interaction.options.getString === 'function' ? interaction.options.getString('type') : null;
        if (KINDS[kind]) return entityAutocomplete(interaction, kind, deps);
        return animeAutocomplete(interaction, deps);
    },
    async execute(interaction, _client, deps = {}) {
        await defer(interaction);
        const raw = interaction.options.getString('query');
        const kind = interaction.options.getString('type');
        if (KINDS[kind]) {
            if (typeof raw !== 'string' || !raw.trim()) return finish(interaction, ephemeral('Give me a name to search for.'));
            if (containsSlur(raw)) return finish(interaction, ephemeral(BLOCKED));
            return searchEntity(interaction, kind, raw, deps);
        }
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
