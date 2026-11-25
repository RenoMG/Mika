const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { animeAutocomplete, resolveAnime, respondWithin } = require('../../anime/autocomplete');
const {
    MAX_LISTS,
    MAX_LIST_ENTRIES,
    NAME_MAX,
    addToList,
    applyCustomLists,
    createList,
    deleteList,
    entryChoices,
    findList,
    listChoices,
    readCustomLists,
    removeFromList,
    renameList,
} = require('../../anime/customLists');
const { snowflake } = require('../../anime/ids');
const { findEntry } = require('../../anime/library');
const { ephemeral } = require('../../anime/menu');
const { personName, presentUserList } = require('../../anime/pagedList');
const { SETUP_FIRST, getProfile, noteIdentity } = require('../../anime/profiles');
const { neutralize } = require('../../anime/text');

const VIEW_PREV = 'customlist:view:prev';
const VIEW_NEXT = 'customlist:view:next';
const NO_LIST = 'You have no list with that name. See yours with /customlist view.';
const PICK = 'Pick an anime from the list. If the list was empty, try again in a minute.';
const BAD_NAME = `List names are plain text, 1 to ${NAME_MAX} characters.`;

function titled(title) {
    return neutralize(title, 200) || 'that anime';
}

function listOption(option, description = 'Which of your lists.') {
    return option.setName('list').setDescription(description).setRequired(true).setAutocomplete(true).setMaxLength(NAME_MAX);
}

function overviewLines(profile) {
    return readCustomLists(profile).map((list) => `🗂️ **${list.name}** · ${list.entries.length} ${list.entries.length === 1 ? 'show' : 'shows'}`);
}

async function viewerCanSee(interaction, targetId, profile) {
    if (!profile) return false;
    if (targetId === interaction.user.id || profile.discoverable === true) return true;
    const cache = interaction.guild && interaction.guild.members && interaction.guild.members.cache;
    return Boolean(cache && typeof cache.has === 'function' && cache.has(targetId));
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('customlist')
        .setDescription(`Your own named lists, like "Comfort shows" (up to ${MAX_LISTS}).`)
        .addSubcommand((sub) => sub
            .setName('create')
            .setDescription('Make a new list.')
            .addStringOption((option) => option.setName('name').setDescription('The list name.').setRequired(true).setMaxLength(NAME_MAX)))
        .addSubcommand((sub) => sub
            .setName('add')
            .setDescription('Add a show to one of your lists.')
            .addStringOption((option) => listOption(option))
            .addStringOption((option) => option.setName('anime').setDescription('Search AniList, then pick one.').setRequired(true).setAutocomplete(true).setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Take a show off one of your lists.')
            .addStringOption((option) => listOption(option))
            .addStringOption((option) => option.setName('anime').setDescription('Which show.').setRequired(true).setAutocomplete(true).setMaxLength(100)))
        .addSubcommand((sub) => sub
            .setName('rename')
            .setDescription('Rename one of your lists.')
            .addStringOption((option) => listOption(option))
            .addStringOption((option) => option.setName('name').setDescription('The new name.').setRequired(true).setMaxLength(NAME_MAX)))
        .addSubcommand((sub) => sub
            .setName('delete')
            .setDescription('Delete one of your lists. The shows stay on your other lists.')
            .addStringOption((option) => listOption(option)))
        .addSubcommand((sub) => sub
            .setName('view')
            .setDescription('See someone\'s lists, or the shows on one of them.')
            .addUserOption((option) => option.setName('user').setDescription('Whose lists. Defaults to you.'))
            .addStringOption((option) => option.setName('list').setDescription('One list. Leave empty to see all of them.').setAutocomplete(true).setMaxLength(NAME_MAX)))),
    category: 'anime',
    replies: 'private',
    subcommandReplies: { view: 'public' },
    checkDisabledChannels: true,
    example: '/customlist create name:Comfort shows',
    examples: {
        create: '/customlist create name:Comfort shows',
        add: '/customlist add list:Comfort shows anime:K-On!',
        remove: '/customlist remove list:Comfort shows anime:K-On!',
        rename: '/customlist rename list:Comfort shows name:Cozy',
        delete: '/customlist delete list:Cozy',
        view: '/customlist view user:@user list:Comfort shows',
    },
    async autocomplete(interaction, deps = {}) {
        const sub = interaction.options.getSubcommand(false);
        const focused = interaction.options.getFocused(true);
        const loadProfile = deps.getProfile || getProfile;
        if (sub === 'add' && focused.name === 'anime') {
            await animeAutocomplete(interaction, deps);
            return;
        }
        await respondWithin(interaction, async () => {
            let targetId = snowflake(interaction.user && interaction.user.id);
            if (sub === 'view') {
                const picked = interaction.options.get ? interaction.options.get('user') : null;
                const other = snowflake(picked && picked.value);
                if (other) targetId = other;
            }
            const profile = targetId ? await loadProfile(targetId) : null;
            if (!(await viewerCanSee(interaction, targetId, profile))) return [];
            if (focused.name === 'anime') return entryChoices(profile, interaction.options.getString('list'), focused.value);
            return listChoices(profile, focused.value);
        }, []);
    },
    async execute(interaction, _client, deps = {}) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'view') {
            const rawList = interaction.options.getString('list');
            let heading = null;
            return (deps.presentUserList || presentUserList)(interaction, {
                commandName: 'customlist',
                title: (user) => (heading ? `🗂️ ${personName(user)} · ${heading}` : `🗂️ ${personName(user)}'s custom lists`),
                empty: rawList ? 'That list is empty, or there is no list with that name.' : 'No custom lists yet. Make one with /customlist create.',
                footerLabel: 'profile',
                prevId: VIEW_PREV,
                nextId: VIEW_NEXT,
                lines: (profile) => {
                    if (!rawList) return overviewLines(profile);
                    const lists = readCustomLists(profile);
                    const index = findList(lists, rawList);
                    if (index < 0) return [];
                    heading = lists[index].name;
                    return lists[index].entries.map((entry) => `• ${neutralize(entry.title, 120) || 'Anime'}`);
                },
            });
        }

        await defer(interaction, { ephemeral: true });
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await (deps.getProfile || getProfile)(userId) : null;
        if (!profile) return finish(interaction, ephemeral(SETUP_FIRST));
        await (deps.noteIdentity || noteIdentity)(profile, interaction.user, interaction.member);

        const save = async (lists) => {
            applyCustomLists(profile, lists);
            await profile.save();
        };

        if (sub === 'create') {
            const result = createList(profile, interaction.options.getString('name'));
            if (!result.ok && result.reason === 'full') return finish(interaction, ephemeral(`You have ${MAX_LISTS} lists already. Delete one first.`));
            if (!result.ok && result.reason === 'duplicate') return finish(interaction, ephemeral('You already have a list with that name.'));
            if (!result.ok) return finish(interaction, ephemeral(BAD_NAME));
            await save(result.lists);
            return finish(interaction, ephemeral(`🗂️ Made **${result.list.name}**. Add shows with /customlist add.`));
        }

        if (sub === 'delete') {
            const result = deleteList(profile, interaction.options.getString('list'));
            if (!result.ok) return finish(interaction, ephemeral(NO_LIST));
            await save(result.lists);
            return finish(interaction, ephemeral(`Deleted **${result.list.name}**.`));
        }

        if (sub === 'rename') {
            const result = renameList(profile, interaction.options.getString('list'), interaction.options.getString('name'));
            if (!result.ok && result.reason === 'missing') return finish(interaction, ephemeral(NO_LIST));
            if (!result.ok && result.reason === 'duplicate') return finish(interaction, ephemeral('You already have a list with that name.'));
            if (!result.ok) return finish(interaction, ephemeral(BAD_NAME));
            await save(result.lists);
            return finish(interaction, ephemeral(`Renamed **${result.oldName}** to **${result.list.name}**.`));
        }

        if (sub === 'remove') {
            const result = removeFromList(profile, interaction.options.getString('list'), interaction.options.getString('anime'));
            if (!result.ok && result.reason === 'missing') return finish(interaction, ephemeral(NO_LIST));
            if (!result.ok) return finish(interaction, ephemeral('That show is not on that list.'));
            await save(result.lists);
            return finish(interaction, ephemeral(`Removed **${titled(result.removed.title)}** from **${result.list.name}**.`));
        }

        // add
        const rawList = interaction.options.getString('list');
        if (findList(readCustomLists(profile), rawList) < 0) return finish(interaction, ephemeral(NO_LIST));
        const raw = interaction.options.getString('anime');
        const own = findEntry(profile, raw);
        const media = own ? own.entry : await (deps.resolveAnime || resolveAnime)(raw);
        if (!media) return finish(interaction, ephemeral(PICK));
        const result = addToList(profile, rawList, media);
        if (!result.ok && result.reason === 'duplicate') return finish(interaction, ephemeral(`That show is already on **${result.list.name}**.`));
        if (!result.ok && result.reason === 'full') return finish(interaction, ephemeral(`**${result.list.name}** is full (${MAX_LIST_ENTRIES}).`));
        if (!result.ok) return finish(interaction, ephemeral(PICK));
        await save(result.lists);
        return finish(interaction, ephemeral(`Added **${titled(result.title)}** to **${result.list.name}** (${result.list.entries.length}/${MAX_LIST_ENTRIES}).`));
    },
};
