const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { footer } = require('./lib/present');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('pfp')
        .setDescription('Gets the profile picture of a member.')
        .addUserOption((option) => option.setName('target').setDescription('The user mentioned.'))),
    category: 'information',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/pfp target:@user',
    async execute(interaction) {
        const user = interaction.options.getUser('target');
        if (!user) return interaction.reply({ content: 'Please mention a user!', allowedMentions: allowedMentions() });
        const member = interaction.options.getMember('target');
        if (!member) return interaction.reply({ content: 'That user is not in this server.', allowedMentions: allowedMentions() });
        const userEmbed = new EmbedBuilder()
            .setTitle('PFP')
            .setImage(member.displayAvatarURL())
            .setColor(member.displayHexColor)
            .setDescription(`**Here is the profile picture of ${member.displayName}.**`)
            .setTimestamp()
            .setFooter(footer('Mika | 🐹 AVATAR!'));
        await interaction.reply({ embeds: [userEmbed], allowedMentions: allowedMentions(user.id) });
    },
};
