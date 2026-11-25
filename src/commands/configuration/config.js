const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { SECTIONS } = require('./hub/sections');
const { openHub } = require('./hub/hub');

// One command for every server setting. Discord hides it from members without
// Manage Server, and interactionCreate and every menu click check it again.
module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('config')
        .setDescription('View and change all of this server\'s settings.')
        .addStringOption((option) => option
            .setName('section')
            .setDescription('Jump straight to one section.')
            .addChoices(...SECTIONS.map((section) => ({ name: section.label, value: section.id })))),
    PermissionFlagsBits.ManageGuild),
    category: 'configuration',
    replies: 'private',
    checkDisabledChannels: true,
    permissions: [PermissionFlagsBits.ManageGuild],
    // Saving settings needs nothing from the bot. Roles and channels are checked when picked.
    botPermissions: [],
    example: '/config',
    note: 'Welcome and level-up messages take placeholders: `{user}` mention · `{userd}` display name · `{level}` new level.',
    async execute(interaction, _client, deps = {}) {
        const section = interaction.options && typeof interaction.options.getString === 'function'
            ? interaction.options.getString('section')
            : null;
        return openHub(interaction, section, deps);
    },
};
