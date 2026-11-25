const { finish: finishReply } = require('../../utils/ack');
const { GENERIC_ERROR } = require('../../utils/messages');
const { SlashCommandBuilder } = require('discord.js');
const AnimeProfile = require('../../Models/AnimeProfile');
const { defer, finish } = require('../../utils/ack');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { getProfile, rememberNames } = require('../../anime/profiles');
const { addVisibilityOption, parseVisibility, visibilityLabel } = require('../../anime/visibility');

module.exports = {
    data: applySlashDefaults(addVisibilityOption(new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Create your anime profile.'), { required: true })
        .addBooleanOption((option) => option
            .setName('recommendations')
            .setDescription('Let people recommend anime to you.')
            .setRequired(true))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/setup visibility:Global recommendations:True',
    async execute(interaction, _client, deps = {}) {
        const userId = snowflake(interaction.user && interaction.user.id);
        if (!userId) return finishReply(interaction, ephemeral(GENERIC_ERROR));
        await defer(interaction, { ephemeral: true });
        const existing = await (deps.getProfile || getProfile)(userId);
        if (existing) return finish(interaction, ephemeral('You already have an anime profile. Use /settings to change it.'));

        const discoverable = parseVisibility(interaction.options.getString('visibility'));
        const recommendations = interaction.options.getBoolean('recommendations');
        if (typeof discoverable !== 'boolean' || typeof recommendations !== 'boolean') {
            return finish(interaction, ephemeral('Choose a visibility (Local or Global) and whether you want recommendations.'));
        }

        const draft = {
            userId,
            discoverable,
            recommendations,
            bio: '',
            watching: '',
            favoriteId: '',
            favoriteTitle: '',
            genres: [],
            accepted: [],
        };
        rememberNames(draft, interaction.user, interaction.member);
        if (deps.create) await deps.create(draft);
        else await AnimeProfile.create(draft);
        const recs = recommendations ? 'on' : 'off';
        return finish(interaction, ephemeral(`🎉 Profile created! Visibility: **${visibilityLabel({ discoverable })}** · Recommendations: **${recs}**.\nFill it in with /bio, /watching, /completed, /favorite, and /genres.`));
    },
};
