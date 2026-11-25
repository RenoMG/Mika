const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { animeAutocomplete, resolveAnime, respondWithin } = require('../../anime/autocomplete');
const {
    COMPLETE_FULL,
    LEGACY_COMPLETE,
    completeFromWatching,
    writeBoth,
} = require('../../anime/completed');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const {
    WATCHING_NEXT,
    WATCHING_PREV,
    personName,
    presentUserList,
} = require('../../anime/pagedList');
const { SETUP_FIRST, getProfile, noteIdentity } = require('../../anime/profiles');
const { neutralize } = require('../../anime/text');
const {
    LEGACY_TOKEN,
    MAX_WATCHING,
    addWatching,
    applyWatching,
    legacyWatching,
    readWatching,
    removeWatching,
    watchingLines,
} = require('../../anime/watching');

function titled(title) {
    return neutralize(title, 200) || 'that anime';
}

function saved(profile, list, options) {
    applyWatching(profile, list, options);
    return profile.save();
}

function removeChoices(profile, query, { legacy = true } = {}) {
    const choices = [];
    for (const item of readWatching(profile)) {
        const hay = `${item.title} ${item.anilistId}`.toLowerCase();
        if (query && !hay.includes(query)) continue;
        const mark = item.recommended ? '💌 ' : '';
        choices.push({ name: `${mark}${item.title}`.slice(0, 100), value: item.anilistId });
    }
    if (!legacy) return choices.slice(0, 25);
    const older = legacyWatching(profile);
    if (older && (!query || older.toLowerCase().includes(query))) {
        let name = older.slice(0, 100);
        if (choices.some((choice) => choice.name === name)) name = `${older} (saved)`.slice(0, 100);
        choices.push({ name, value: LEGACY_TOKEN });
    }
    return choices.slice(0, 25);
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('watching')
        .setDescription('Add, remove, list, complete, or clear what you are watching (up to 20).')
        .addSubcommand((sub) => sub
            .setName('add')
            .setDescription('Add an anime to your watching list.')
            .addStringOption((option) => option
                .setName('anime')
                .setDescription('Search AniList, then pick one.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Remove an anime from your watching list.')
            .addStringOption((option) => option
                .setName('anime')
                .setDescription('Which show to remove.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('complete')
            .setDescription('Mark a show you are watching as completed.')
            .addStringOption((option) => option
                .setName('anime')
                .setDescription('Which show you finished.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('list')
            .setDescription('Show a watching list. Defaults to you.')
            .addUserOption((option) => option
                .setName('user')
                .setDescription('Whose list to view. Defaults to you.')))
        .addSubcommand((sub) => sub
            .setName('clear')
            .setDescription('Clear your watching list.'))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/watching add anime:Cowboy Bebop',
    examples: {
        add: '/watching add anime:Cowboy Bebop',
        remove: '/watching remove anime:Cowboy Bebop',
        complete: '/watching complete anime:Cowboy Bebop',
        list: '/watching list',
        clear: '/watching clear',
    },
    async autocomplete(interaction, deps = {}) {
        const sub = interaction.options && typeof interaction.options.getSubcommand === 'function'
            ? interaction.options.getSubcommand(false)
            : '';
        if (sub === 'remove' || sub === 'complete') {
            const loadProfile = deps.getProfile || getProfile;
            await respondWithin(interaction, async () => {
                const userId = snowflake(interaction.user && interaction.user.id);
                const profile = userId ? await loadProfile(userId) : null;
                const focused = interaction.options.getFocused(true);
                const query = String(focused && focused.value || '').trim().toLowerCase();
                return removeChoices(profile, query, { legacy: sub === 'remove' });
            }, []);
            return;
        }
        if (sub === 'add') {
            await animeAutocomplete(interaction, deps);
            return;
        }
        await respondWithin(interaction, async () => [], []);
    },
    async execute(interaction, _client, deps = {}) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'list') {
            return (deps.presentUserList || presentUserList)(interaction, {
                commandName: 'watching',
                title: (user) => `📺 ${personName(user)}'s watching list`,
                empty: 'Nothing here yet. Add a show with /watching add.',
                footerLabel: 'watching',
                prevId: WATCHING_PREV,
                nextId: WATCHING_NEXT,
                lines: watchingLines,
            });
        }

        await defer(interaction, { ephemeral: true });
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await (deps.getProfile || getProfile)(userId) : null;
        if (!profile) return finish(interaction, ephemeral(SETUP_FIRST));
        await (deps.noteIdentity || noteIdentity)(profile, interaction.user, interaction.member);

        if (sub === 'clear') {
            const legacy = legacyWatching(profile);
            await saved(profile, []);
            const extra = legacy
                ? ' The older saved line is still there. Remove it with /watching remove.'
                : '';
            return finish(interaction, ephemeral(`Cleared your watching list.${extra}`));
        }

        if (sub === 'remove') {
            const result = removeWatching(profile, interaction.options.getString('anime'));
            if (!result.ok) return finish(interaction, ephemeral('That anime is not on your list.'));
            await saved(profile, result.list, { clearLegacy: result.clearLegacy });
            return finish(interaction, ephemeral(`Removed **${titled(result.removed.title)}** from your watching list.`));
        }

        if (sub === 'complete') {
            const result = completeFromWatching(profile, interaction.options.getString('anime'));
            if (!result.ok && result.reason === 'legacy') return finish(interaction, ephemeral(LEGACY_COMPLETE));
            if (!result.ok && result.reason === 'full') return finish(interaction, ephemeral(COMPLETE_FULL));
            if (!result.ok) return finish(interaction, ephemeral('That anime is not on your watching list.'));
            await writeBoth(profile, result.watching, result.completed);
            if (result.redated) {
                return finish(interaction, ephemeral(`**${titled(result.title)}** was already completed. The date is updated.`));
            }
            return finish(interaction, ephemeral(`Marked **${titled(result.title)}** completed.`));
        }

        const media = await (deps.resolveAnime || resolveAnime)(interaction.options.getString('anime'));
        if (!media) {
            return finish(interaction, ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        const result = addWatching(profile, media);
        if (!result.ok && result.reason === 'duplicate') {
            return finish(interaction, ephemeral(`**${titled(media && (media.titles && (media.titles.english || media.titles.romaji)))}** is already on your list.`));
        }
        if (result.reason === 'full') {
            return finish(interaction, ephemeral(`Your watching list is full (${MAX_WATCHING}/${MAX_WATCHING}). Remove one with /watching remove, or mark one completed.`));
        }
        if (!result.ok) {
            return finish(interaction, ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        await saved(profile, result.list);
        const added = result.list[result.list.length - 1];
        return finish(interaction, ephemeral(`Added **${titled(added.title)}** to your watching list (${result.list.length}/${MAX_WATCHING}).`));
    },
};
