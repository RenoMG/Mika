const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { animeAutocomplete, resolveAnime, respondWithin } = require('../../anime/autocomplete');
const {
    COMPLETE_FULL,
    addCompleted,
    applyCompleted,
    completedChoices,
    completedListLines,
    removeCompleted,
    writeBoth,
} = require('../../anime/completed');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const {
    COMPLETED_NEXT,
    COMPLETED_PREV,
    personName,
    presentUserList,
} = require('../../anime/pagedList');
const { SETUP_FIRST, getProfile, noteIdentity } = require('../../anime/profiles');
const { neutralize } = require('../../anime/text');

function titled(title) {
    return neutralize(title, 200) || 'that anime';
}

function addedMessage(result) {
    const title = titled(result.title);
    if (result.redated && result.removedWatching) {
        return `**${title}** was already completed. It was taken off your watching list and the date is updated.`;
    }
    if (result.redated) return `**${title}** was already completed. The date is updated.`;
    if (result.removedWatching) return `Marked **${title}** completed and took it off your watching list.`;
    return `Added **${title}** to your completed list.`;
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('completed')
        .setDescription('List, add, or remove anime you have finished.')
        .addSubcommand((sub) => sub
            .setName('list')
            .setDescription('Show a completed list. Defaults to you.')
            .addUserOption((option) => option
                .setName('user')
                .setDescription('Whose list to view. Defaults to you.')))
        .addSubcommand((sub) => sub
            .setName('add')
            .setDescription('Add a show you finished before tracking it here.')
            .addStringOption((option) => option
                .setName('anime')
                .setDescription('Search AniList, then pick one.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Remove a show from your completed list.')
            .addStringOption((option) => option
                .setName('anime')
                .setDescription('Which completed show to remove.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(100)))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/completed list',
    examples: {
        list: '/completed list user:@user',
        add: '/completed add anime:Cowboy Bebop',
        remove: '/completed remove anime:Cowboy Bebop',
    },
    async autocomplete(interaction, deps = {}) {
        const sub = interaction.options && typeof interaction.options.getSubcommand === 'function'
            ? interaction.options.getSubcommand(false)
            : '';
        if (sub === 'remove') {
            const loadProfile = deps.getProfile || getProfile;
            await respondWithin(interaction, async () => {
                const userId = snowflake(interaction.user && interaction.user.id);
                const profile = userId ? await loadProfile(userId) : null;
                const focused = interaction.options.getFocused(true);
                const query = String(focused && focused.value || '').trim().toLowerCase();
                return completedChoices(profile, query);
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
                commandName: 'completed',
                title: (user) => `✅ ${personName(user)}'s completed list`,
                empty: 'Nothing here yet. Add a show with /completed add.',
                footerLabel: 'completed',
                prevId: COMPLETED_PREV,
                nextId: COMPLETED_NEXT,
                lines: completedListLines,
            });
        }

        await defer(interaction, { ephemeral: true });
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await (deps.getProfile || getProfile)(userId) : null;
        if (!profile) return finish(interaction, ephemeral(SETUP_FIRST));
        await (deps.noteIdentity || noteIdentity)(profile, interaction.user, interaction.member);

        if (sub === 'remove') {
            const result = removeCompleted(profile, interaction.options.getString('anime'));
            if (!result.ok) return finish(interaction, ephemeral('That anime is not on your completed list.'));
            applyCompleted(profile, result.list);
            await profile.save();
            return finish(interaction, ephemeral(`Removed **${titled(result.removed.title)}** from your completed list.`));
        }

        const media = await (deps.resolveAnime || resolveAnime)(interaction.options.getString('anime'));
        if (!media) {
            return finish(interaction, ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        const result = addCompleted(profile, media);
        if (!result.ok && result.reason === 'full') return finish(interaction, ephemeral(COMPLETE_FULL));
        if (!result.ok) {
            return finish(interaction, ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        await writeBoth(profile, result.watching, result.completed);
        return finish(interaction, ephemeral(addedMessage(result)));
    },
};
