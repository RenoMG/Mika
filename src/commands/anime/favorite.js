const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { isCurrent } = require('../../anime/autocomplete');
const { anilistQueryWait, peekEntities, searchEntities } = require('../../anime/entitySearch');
const { personName, presentUserList } = require('../../anime/pagedList');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { animeAutocomplete, resolveAnime, respondWithin } = require('../../anime/autocomplete');
const {
    ENTITY_KINDS,
    MAX_ENTITIES,
    MAX_FAVORITES,
    addEntity,
    addFavorite,
    applyEntities,
    readEntities,
    removeEntity,
    applyFavorites,
    readFavorites,
    removeFavorite,
    reorderFavorites,
} = require('../../anime/favorites');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { SETUP_FIRST, getProfile, noteIdentity } = require('../../anime/profiles');
const { containsSlur, neutralize } = require('../../anime/text');

const LIST_PREV = 'favorite:list:prev';
const LIST_NEXT = 'favorite:list:next';
const COALESCE_MS = 150;

// Autocomplete values carry "id|name" so the pick saves without another
// request. Both halves are checked again before saving.
function parseEntityValue(raw) {
    const text = String(raw == null ? '' : raw);
    const match = /^(\d{1,10})\|(.{1,100})$/s.exec(text);
    if (!match) return null;
    const name = neutralize(match[2], 100);
    if (!name || containsSlur(name)) return null;
    return { id: match[1], name };
}

function entityGroup(group, kind) {
    const info = ENTITY_KINDS[kind];
    return group
        .setName(kind)
        .setDescription(`Your favorite ${info.plural} (up to ${MAX_ENTITIES}).`)
        .addSubcommand((sub) => sub
            .setName('add')
            .setDescription(`Add a favorite ${info.label}.`)
            .addStringOption((option) => option
                .setName('name')
                .setDescription('Search AniList, then pick one.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription(`Remove a favorite ${info.label}.`)
            .addStringOption((option) => option
                .setName('name')
                .setDescription(`Which ${info.label}.`)
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)));
}

function favoriteLines(profile) {
    const lines = [];
    const anime = readFavorites(profile);
    if (anime.length) {
        lines.push('**⭐ Anime**');
        anime.forEach((item, index) => lines.push(`${index + 1}. ${neutralize(item.title, 100) || 'Anime'}`));
    }
    for (const [kind, info] of Object.entries(ENTITY_KINDS)) {
        const list = readEntities(profile, kind);
        if (!list.length) continue;
        lines.push(`**${info.emoji} ${info.plural[0].toUpperCase()}${info.plural.slice(1)}**`);
        for (const item of list) lines.push(`• ${neutralize(item.name, 100) || 'Unknown'}`);
    }
    return lines;
}

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
        .setDescription('Your top 5 anime, plus favorite characters, staff, and studios.')
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
            .setDescription('Clear your favorite anime.'))
        .addSubcommand((sub) => sub
            .setName('list')
            .setDescription('Show favorite anime, characters, staff, and studios. Defaults to you.')
            .addUserOption((option) => option
                .setName('user')
                .setDescription('Whose favorites. Defaults to you.')))
        .addSubcommandGroup((group) => entityGroup(group, 'character'))
        .addSubcommandGroup((group) => entityGroup(group, 'staff'))
        .addSubcommandGroup((group) => entityGroup(group, 'studio'))),
    category: 'anime',
    replies: 'private',
    subcommandReplies: { list: 'public' },
    checkDisabledChannels: true,
    example: '/favorite add anime:Cowboy Bebop',
    examples: {
        add: '/favorite add anime:Cowboy Bebop',
        remove: '/favorite remove anime:Cowboy Bebop',
        reorder: '/favorite reorder from:2 to:1',
        clear: '/favorite clear',
        list: '/favorite list user:@user',
        'character add': '/favorite character add name:Frieren',
        'character remove': '/favorite character remove name:Frieren',
        'staff add': '/favorite staff add name:Hayao Miyazaki',
        'staff remove': '/favorite staff remove name:Hayao Miyazaki',
        'studio add': '/favorite studio add name:MADHOUSE',
        'studio remove': '/favorite studio remove name:MADHOUSE',
    },
    async autocomplete(interaction, deps = {}) {
        const sub = interaction.options && typeof interaction.options.getSubcommand === 'function'
            ? interaction.options.getSubcommand(false)
            : '';
        const group = typeof interaction.options.getSubcommandGroup === 'function'
            ? interaction.options.getSubcommandGroup(false)
            : null;
        if (group && ENTITY_KINDS[group]) {
            const loadProfile = deps.getProfile || getProfile;
            await respondWithin(interaction, async () => {
                const focused = interaction.options.getFocused(true);
                const query = String(focused && focused.value || '').trim();
                if (sub === 'remove') {
                    const userId = snowflake(interaction.user && interaction.user.id);
                    const profile = userId ? await loadProfile(userId) : null;
                    const needle = query.toLowerCase();
                    return readEntities(profile, group)
                        .filter((item) => !needle || item.name.toLowerCase().includes(needle))
                        .slice(0, 25)
                        .map((item) => ({ name: item.name.slice(0, 100), value: item.id }));
                }
                if (query.length < 2 || containsSlur(query)) return [];
                const peek = (deps.peekEntities || peekEntities)(group, query);
                let found = peek;
                if (!found) {
                    await new Promise((resolve) => setTimeout(resolve, deps.coalesceMs ?? COALESCE_MS));
                    if (!isCurrent(interaction)) return [];
                    if ((deps.anilistQueryWait || anilistQueryWait)() > 1500) return [];
                    found = await (deps.searchEntities || searchEntities)(group, query, { timeoutMs: 1800 });
                }
                return (found || []).slice(0, 25).map((item) => {
                    const name = neutralize(item.name, 80) || 'Unknown';
                    return { name, value: `${item.id}|${name}`.slice(0, 100) };
                });
            }, []);
            return;
        }
        if (sub === 'list') {
            await respondWithin(interaction, async () => [], []);
            return;
        }
        if (sub === 'remove') {
            const loadProfile = deps.getProfile || getProfile;
            await respondWithin(interaction, async () => {
                const userId = snowflake(interaction.user && interaction.user.id);
                const profile = userId ? await loadProfile(userId) : null;
                const focused = interaction.options.getFocused(true);
                const query = String(focused && focused.value || '').trim().toLowerCase();
                return readFavorites(profile)
                    .filter((item) => !query || item.title.toLowerCase().includes(query) || item.anilistId.includes(query))
                    .slice(0, 25)
                    .map((item) => ({ name: item.title.slice(0, 100), value: item.anilistId }));
            }, []);
            return;
        }
        await animeAutocomplete(interaction, deps);
    },
    async execute(interaction, _client, deps = {}) {
        const sub = interaction.options.getSubcommand();
        const group = typeof interaction.options.getSubcommandGroup === 'function'
            ? interaction.options.getSubcommandGroup(false)
            : null;
        if (!group && sub === 'list') {
            return (deps.presentUserList || presentUserList)(interaction, {
                commandName: 'favorite',
                title: (user) => `⭐ ${personName(user)}'s favorites`,
                empty: 'No favorites yet. Add one with /favorite add.',
                footerLabel: 'profile',
                prevId: LIST_PREV,
                nextId: LIST_NEXT,
                lines: favoriteLines,
            });
        }
        await defer(interaction, { ephemeral: true });
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await (deps.getProfile || getProfile)(userId) : null;
        if (!profile) return finish(interaction, ephemeral(SETUP_FIRST));
        await (deps.noteIdentity || noteIdentity)(profile, interaction.user, interaction.member);

        if (group && ENTITY_KINDS[group]) {
            const info = ENTITY_KINDS[group];
            const raw = interaction.options.getString('name');
            if (sub === 'remove') {
                const result = removeEntity(profile, group, raw);
                if (!result.ok) return finish(interaction, ephemeral(`That ${info.label} is not on your favorites.`));
                applyEntities(profile, group, result.list);
                await profile.save();
                return finish(interaction, ephemeral(`Removed **${result.removed.name}** from your favorite ${info.plural}.`));
            }
            const picked = parseEntityValue(raw);
            if (!picked) return finish(interaction, ephemeral(`Pick a ${info.label} from the list. If it was empty, try again in a minute.`));
            const result = addEntity(profile, group, picked);
            if (!result.ok && result.reason === 'duplicate') return finish(interaction, ephemeral(`**${picked.name}** is already a favorite.`));
            if (!result.ok && result.reason === 'full') return finish(interaction, ephemeral(`You have ${MAX_ENTITIES} favorite ${info.plural}. Remove one first.`));
            if (!result.ok) return finish(interaction, ephemeral(`Pick a ${info.label} from the list.`));
            applyEntities(profile, group, result.list);
            await profile.save();
            return finish(interaction, ephemeral(`${info.emoji} Added **${result.added.name}** to your favorite ${info.plural} (${result.list.length}/${MAX_ENTITIES}).`));
        }

        if (sub === 'clear') {
            await saved(profile, []);
            return finish(interaction, ephemeral('Cleared your favorites.'));
        }

        if (sub === 'reorder') {
            const from = interaction.options.getInteger('from');
            const to = interaction.options.getInteger('to');
            const result = reorderFavorites(profile, from, to);
            if (!result.ok) {
                const message = readFavorites(profile).length < 2
                    ? 'Add at least two favorites before reordering.'
                    : 'Pick spots that are on your list.';
                return finish(interaction, ephemeral(message));
            }
            await saved(profile, result.list);
            return finish(interaction, ephemeral(`Moved **${titled(result.moved.title)}** to #${to}.`));
        }

        if (sub === 'remove') {
            const result = removeFavorite(profile, interaction.options.getString('anime'));
            if (!result.ok) return finish(interaction, ephemeral('That anime is not on your list.'));
            await saved(profile, result.list);
            return finish(interaction, ephemeral(`Removed **${titled(result.removed.title)}** from your favorites.`));
        }

        const media = await (deps.resolveAnime || resolveAnime)(interaction.options.getString('anime'));
        if (!media) {
            return finish(interaction, ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        const result = addFavorite(profile, media);
        if (!result.ok && result.reason === 'duplicate') {
            return finish(interaction, ephemeral(`**${titled(media && (media.titles && (media.titles.english || media.titles.romaji)))}** is already on your list.`));
        }
        if (result.reason === 'full') {
            return finish(interaction, ephemeral(`Your top ${MAX_FAVORITES} is full. Remove one with /favorite remove.`));
        }
        if (!result.ok) {
            return finish(interaction, ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        await saved(profile, result.list);
        const added = result.list[result.list.length - 1];
        return finish(interaction, ephemeral(`Added **${titled(added.title)}** to your favorites (${result.list.length}/${MAX_FAVORITES}).`));
    },
};
