const { SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { noteIdentity, profileForViewer } = require('../../anime/profiles');
const { profileEmbed } = require('../../anime/profileView');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('profile')
        .setDescription("View your anime profile, or another member's.")
        .addUserOption((option) => option.setName('target').setDescription('Whose profile to view. Defaults to you.'))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/profile target:@user',
    async execute(interaction) {
        const requested = interaction.options.getUser('target');
        const target = requested || interaction.user;
        const viewerId = interaction.user && interaction.user.id;
        const targetId = target && target.id;
        const self = Boolean(snowflake(targetId) && snowflake(targetId) === snowflake(viewerId));
        let sameGuild = self;
        if (!self && requested && typeof interaction.options.getMember === 'function') {
            sameGuild = Boolean(interaction.options.getMember('target'));
        }
        const decision = await profileForViewer(targetId, viewerId, { sameGuild });
        if (!decision.show) return interaction.reply(ephemeral(decision.message));
        let member = null;
        if (typeof interaction.options.getMember === 'function') member = interaction.options.getMember('target');
        if (!member && decision.self) member = interaction.member || null;
        await noteIdentity(decision.profile, target, member);
        return interaction.reply(profileEmbed(decision.profile, target, { self: decision.self }));
    },
};
