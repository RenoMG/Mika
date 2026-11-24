const { finish: finishReply } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const AnimeProfile = require('../../Models/AnimeProfile');
const { defer, finish } = require('../../utils/ack');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { getProfile, rememberNames } = require('../../anime/profiles');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Create your anime profile.')
        .addBooleanOption((option) => option
            .setName('discoverable')
            .setDescription('Let other servers find your profile with /findprofile.')
            .setRequired(true))
        .addBooleanOption((option) => option
            .setName('recommendations')
            .setDescription('Let people recommend anime to you.')
            .setRequired(true))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/setup discoverable:True recommendations:True',
    async execute(interaction, _client, deps = {}) {
        const userId = snowflake(interaction.user && interaction.user.id);
        if (!userId) return finishReply(interaction, ephemeral('There was an error while executing this command!'));
        await defer(interaction, { ephemeral: true });
        const existing = await (deps.getProfile || getProfile)(userId);
        if (existing) return finish(interaction, ephemeral('You already have an anime profile. Use /settings to change it.'));

        const discoverable = interaction.options.getBoolean('discoverable');
        const recommendations = interaction.options.getBoolean('recommendations');
        if (typeof discoverable !== 'boolean' || typeof recommendations !== 'boolean') {
            return finish(interaction, ephemeral('Choose whether your profile is discoverable and whether you want recommendations.'));
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
        const discovery = discoverable ? 'discoverable' : 'hidden';
        const recs = recommendations ? 'on' : 'off';
        return finish(interaction, ephemeral(`Profile created. It is ${discovery}, and recommendations are ${recs}. Use /bio, /watching, /completed, /favorite, and /genres to fill it in.`));
    },
};
