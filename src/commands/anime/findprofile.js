const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { MESSAGES, SITES, lookupProfile, validUsername } = require('../../anime/linkedProfiles');
const { ephemeral } = require('../../anime/menu');
const { profilePayload } = require('../../anime/profileView');

// Any public AniList or MyAnimeList profile by username. No linking needed, so
// people can show their own profile or look someone up. Linked accounts of
// server members are shown with /profile instead.
module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('findprofile')
        .setDescription('Look up any public AniList or MyAnimeList profile by username.')
        .addStringOption((option) => option
            .setName('site')
            .setDescription('Which site to look on.')
            .setRequired(true)
            .addChoices({ name: 'AniList', value: 'anilist' }, { name: 'MyAnimeList', value: 'mal' }))
        .addStringOption((option) => option
            .setName('username')
            .setDescription('Their username on that site.')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(20))),
    category: 'anime',
    configKey: 'AnimeCommandStatus',
    replies: 'public',
    checkDisabledChannels: true,
    example: '/findprofile site:AniList username:Kaz',
    async execute(interaction, _client, deps = {}) {
        await defer(interaction);
        const site = interaction.options.getString('site');
        if (!SITES[site]) return finish(interaction, ephemeral('Pick AniList or MyAnimeList.'));
        const username = validUsername(site, interaction.options.getString('username'));
        if (!username) return finish(interaction, ephemeral(MESSAGES.username));
        const result = await (deps.lookupProfile || lookupProfile)(site, username);
        if (!result.ok) {
            const message = result.reason === 'noUser'
                ? `No public ${SITES[site].label} profile is named **${username}**.`
                : (MESSAGES[result.reason] || MESSAGES.unavailable);
            return finish(interaction, ephemeral(message));
        }
        return finish(interaction, {
            ...profilePayload(result.profile, null, { cached: result.cached }),
            allowedMentions: allowedMentions(),
        });
    },
};
