const { SlashCommandBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { getAnime, searchAnime } = require('../../anime/client');
const { SEARCH_ID, buildSearchRow } = require('../../anime/components');
const { animeEmbed } = require('../../anime/embed');
const { mediaId } = require('../../anime/ids');
const { pickTitle } = require('../../anime/match');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { BLOCKED, containsSlur, neutralize } = require('../../anime/text');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('search')
        .setDescription('Look up an anime by title.')
        .addStringOption((option) => option
            .setName('query')
            .setDescription('Title to look up.')
            .setRequired(true)
            .setMaxLength(100))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/search query:cowboy bebop',
    async execute(interaction) {
        const raw = interaction.options.getString('query');
        if (typeof raw !== 'string' || !raw.trim()) {
            return interaction.reply(ephemeral('Give me a title to search for.'));
        }
        if (containsSlur(raw)) return interaction.reply(ephemeral(BLOCKED));

        const results = await searchAnime(raw.trim());
        if (!results.length) return interaction.reply(ephemeral('No anime matched that.'));

        const picked = pickTitle(raw, results);
        if (picked) {
            const full = (await getAnime(picked.id)) || picked;
            return interaction.reply({
                embeds: [animeEmbed(full)],
                allowedMentions: allowedMentions(),
            });
        }

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
