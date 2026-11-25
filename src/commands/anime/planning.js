const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { animeAutocomplete, resolveAnime, respondWithin } = require('../../anime/autocomplete');
const { snowflake } = require('../../anime/ids');
const { recordActivity, statusEvent } = require('../../anime/feed');
const { libraryChoices, libraryLines, readList, removeEntry, setStatus, statusInfo } = require('../../anime/library');
const { ephemeral } = require('../../anime/menu');
const { personName, presentUserList } = require('../../anime/pagedList');
const { SETUP_FIRST, getProfile, noteIdentity } = require('../../anime/profiles');
const { neutralize } = require('../../anime/text');

const PLANNING_PREV = 'planning:list:prev';
const PLANNING_NEXT = 'planning:list:next';
const PICK = 'Pick an anime from the list. If the list was empty, try again in a minute.';

function titled(title) {
    return neutralize(title, 200) || 'that anime';
}

function statusName(id) {
    const info = statusInfo(id);
    return info ? info.label.toLowerCase() : id;
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('planning')
        .setDescription('Shows you plan to watch: add, start, remove, or list them.')
        .addSubcommand((sub) => sub
            .setName('add')
            .setDescription('Add a show to your plan-to-watch list.')
            .addStringOption((option) => option
                .setName('anime')
                .setDescription('Search AniList, then pick one.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('start')
            .setDescription('Start watching a planned show. It moves to your watching list.')
            .addStringOption((option) => option
                .setName('anime')
                .setDescription('Which planned show.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Take a show off your plan-to-watch list.')
            .addStringOption((option) => option
                .setName('anime')
                .setDescription('Which planned show.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('list')
            .setDescription('Show a plan-to-watch list. Defaults to you.')
            .addUserOption((option) => option
                .setName('user')
                .setDescription('Whose list to view. Defaults to you.')))),
    category: 'anime',
    replies: 'private',
    subcommandReplies: { list: 'public' },
    checkDisabledChannels: true,
    example: '/planning add anime:Frieren',
    examples: {
        add: '/planning add anime:Frieren',
        start: '/planning start anime:Frieren',
        remove: '/planning remove anime:Frieren',
        list: '/planning list user:@user',
    },
    async autocomplete(interaction, deps = {}) {
        const sub = interaction.options && typeof interaction.options.getSubcommand === 'function'
            ? interaction.options.getSubcommand(false)
            : '';
        if (sub === 'start' || sub === 'remove') {
            const loadProfile = deps.getProfile || getProfile;
            await respondWithin(interaction, async () => {
                const userId = snowflake(interaction.user && interaction.user.id);
                const profile = userId ? await loadProfile(userId) : null;
                const focused = interaction.options.getFocused(true);
                return libraryChoices(profile, focused && focused.value, { statuses: ['planning'] });
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
                commandName: 'planning',
                title: (user) => `🗓️ ${personName(user)}'s plan-to-watch list`,
                empty: 'Nothing planned yet. Add a show with /planning add.',
                footerLabel: 'profile',
                prevId: PLANNING_PREV,
                nextId: PLANNING_NEXT,
                lines: (profile) => libraryLines(profile, 'planning'),
            });
        }

        await defer(interaction, { ephemeral: true });
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await (deps.getProfile || getProfile)(userId) : null;
        if (!profile) return finish(interaction, ephemeral(SETUP_FIRST));
        await (deps.noteIdentity || noteIdentity)(profile, interaction.user, interaction.member);
        const raw = interaction.options.getString('anime');

        if (sub === 'remove') {
            const planned = readList(profile, 'planning').some((item) => item.anilistId === raw || item.title.toLowerCase() === String(raw || '').trim().toLowerCase());
            if (!planned) return finish(interaction, ephemeral('That anime is not on your plan-to-watch list.'));
            const result = removeEntry(profile, raw);
            await profile.save();
            return finish(interaction, ephemeral(`Removed **${titled(result.entry.title)}** from your plan-to-watch list.`));
        }

        if (sub === 'start') {
            const planned = readList(profile, 'planning').find((item) => item.anilistId === raw || item.title.toLowerCase() === String(raw || '').trim().toLowerCase());
            if (!planned) return finish(interaction, ephemeral('That anime is not on your plan-to-watch list.'));
            const result = setStatus(profile, planned, 'watching');
            if (!result.ok && result.reason === 'full') {
                return finish(interaction, ephemeral(`Your watching list is full (${result.max}). Finish or remove a show first.`));
            }
            if (!result.ok) return finish(interaction, ephemeral('That anime is not on your plan-to-watch list.'));
            await profile.save();
            recordActivity(interaction, statusEvent(result));
            return finish(interaction, ephemeral(`📺 Started **${titled(result.title)}**. Log episodes with /watching progress.`));
        }

        const media = await (deps.resolveAnime || resolveAnime)(raw);
        if (!media) return finish(interaction, ephemeral(PICK));
        const result = setStatus(profile, media, 'planning');
        if (!result.ok && result.reason === 'same') return finish(interaction, ephemeral(`**${titled(result.entry.title)}** is already on your plan-to-watch list.`));
        if (!result.ok && result.reason === 'full') return finish(interaction, ephemeral(`Your plan-to-watch list is full (${result.max}).`));
        if (!result.ok) return finish(interaction, ephemeral(PICK));
        await profile.save();
        recordActivity(interaction, statusEvent(result));
        const moved = result.from ? ` It was on your ${statusName(result.from)} list.` : '';
        return finish(interaction, ephemeral(`🗓️ Added **${titled(result.title)}** to your plan-to-watch list.${moved}`));
    },
};
