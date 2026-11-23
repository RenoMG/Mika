const { SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { animeAutocomplete, resolveAnime } = require('../../anime/autocomplete');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
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
} = require('../../anime/watching');

function titled(title) {
    return neutralize(title, 200) || 'that anime';
}

function saved(profile, list, options) {
    applyWatching(profile, list, options);
    return profile.save();
}

function removeChoices(profile, query) {
    const choices = [];
    for (const item of readWatching(profile)) {
        const hay = `${item.title} ${item.anilistId}`.toLowerCase();
        if (query && !hay.includes(query)) continue;
        const mark = item.recommended ? '💌 ' : '';
        choices.push({ name: `${mark}${item.title}`.slice(0, 100), value: item.anilistId });
    }
    const legacy = legacyWatching(profile);
    if (legacy && (!query || legacy.toLowerCase().includes(query))) {
        let name = legacy.slice(0, 100);
        if (choices.some((choice) => choice.name === name)) name = `${legacy} (saved)`.slice(0, 100);
        choices.push({ name, value: LEGACY_TOKEN });
    }
    return choices.slice(0, 25);
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('watching')
        .setDescription('Add, remove, or clear what you are watching (up to 10).')
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
            .setName('clear')
            .setDescription('Clear your watching list.'))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/watching add anime:Cowboy Bebop',
    examples: {
        add: '/watching add anime:Cowboy Bebop',
        remove: '/watching remove anime:Cowboy Bebop',
        clear: '/watching clear',
    },
    async autocomplete(interaction) {
        const sub = interaction.options && typeof interaction.options.getSubcommand === 'function'
            ? interaction.options.getSubcommand(false)
            : '';
        if (sub === 'remove') {
            const userId = snowflake(interaction.user && interaction.user.id);
            const profile = userId ? await getProfile(userId) : null;
            const focused = interaction.options.getFocused(true);
            const query = String(focused && focused.value || '').trim().toLowerCase();
            await interaction.respond(removeChoices(profile, query));
            return;
        }
        await animeAutocomplete(interaction);
    },
    async execute(interaction) {
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await getProfile(userId) : null;
        if (!profile) return interaction.reply(ephemeral(SETUP_FIRST));
        await noteIdentity(profile, interaction.user, interaction.member);
        const sub = interaction.options.getSubcommand();

        if (sub === 'clear') {
            const legacy = legacyWatching(profile);
            await saved(profile, []);
            const extra = legacy
                ? ' The older saved line is still there. Remove it with /watching remove.'
                : '';
            return interaction.reply(ephemeral(`Cleared your watching list.${extra}`));
        }

        if (sub === 'remove') {
            const result = removeWatching(profile, interaction.options.getString('anime'));
            if (!result.ok) return interaction.reply(ephemeral('That anime is not on your list.'));
            await saved(profile, result.list, { clearLegacy: result.clearLegacy });
            return interaction.reply(ephemeral(`Removed **${titled(result.removed.title)}** from your watching list.`));
        }

        const media = await resolveAnime(interaction.options.getString('anime'));
        if (!media) {
            return interaction.reply(ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        const result = addWatching(profile, media);
        if (!result.ok && result.reason === 'duplicate') {
            return interaction.reply(ephemeral(`**${titled(media && (media.titles && (media.titles.english || media.titles.romaji)))}** is already on your list.`));
        }
        if (result.reason === 'full') {
            return interaction.reply(ephemeral(`Your watching list is full. Remove one with /watching remove.`));
        }
        if (!result.ok) {
            return interaction.reply(ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        await saved(profile, result.list);
        const added = result.list[result.list.length - 1];
        return interaction.reply(ephemeral(`Added **${titled(added.title)}** to your watching list (${result.list.length}/${MAX_WATCHING}).`));
    },
};
