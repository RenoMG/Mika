const { SlashCommandBuilder } = require('discord.js');
const AnimeProfile = require('../../Models/AnimeProfile');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { getProfile } = require('../../anime/profiles');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Create your anime profile.')
        .addBooleanOption((option) => option
            .setName('discoverable')
            .setDescription('Let other servers find and view your profile.')
            .setRequired(true))
        .addBooleanOption((option) => option
            .setName('recommendations')
            .setDescription('Let people recommend anime to you.')
            .setRequired(true))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/setup discoverable:True recommendations:True',
    async execute(interaction) {
        const userId = snowflake(interaction.user && interaction.user.id);
        if (!userId) return interaction.reply(ephemeral('There was an error while executing this command!'));
        const existing = await getProfile(userId);
        if (existing) return interaction.reply(ephemeral('You already have an anime profile. Use /settings to change it.'));

        const discoverable = interaction.options.getBoolean('discoverable');
        const recommendations = interaction.options.getBoolean('recommendations');
        if (typeof discoverable !== 'boolean' || typeof recommendations !== 'boolean') {
            return interaction.reply(ephemeral('Choose whether your profile is discoverable and whether you want recommendations.'));
        }

        await AnimeProfile.create({
            userId,
            discoverable,
            recommendations,
            bio: '',
            watching: '',
            favoriteId: '',
            favoriteTitle: '',
            genres: [],
            accepted: [],
        });
        const discovery = discoverable ? 'discoverable' : 'hidden';
        const recs = recommendations ? 'on' : 'off';
        return interaction.reply(ephemeral(`Profile created. It is ${discovery}, and recommendations are ${recs}. Use /bio, /watching, /favorite, and /genres to fill it in.`));
    },
};
