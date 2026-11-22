const { Colors, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { footer } = require('./lib/present');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Returns the invite link for Mika.')),
    category: 'information',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/invite',
    async execute(interaction) {
        const userEmbed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('INVITE')
            .addFields({ name: '**Here is my invite link!** ', value: '❤ ❤ [Add me!](https://discord.com/api/oauth2/authorize?client_id=795165717283471370&permissions=8&scope=bot%20applications.commands) ❤ ❤', inline: false })
            .setTimestamp()
            .setFooter(footer('Mika | ➕ Invite!'));
        await interaction.reply({ embeds: [userEmbed], flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    },
};
