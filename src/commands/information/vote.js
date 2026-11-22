const { Colors, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { footer } = require('./lib/present');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Returns the vote link for Mika.')),
    category: 'information',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/vote',
    async execute(interaction) {
        const userEmbed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('VOTE')
            .addFields({ name: '**Vote for me on top.gg!** ', value: '❤ ❤ [Vote!](https://top.gg/bot/664244372723728424/vote) ❤ ❤', inline: false })
            .setTimestamp()
            .setFooter(footer('Mika | 👍 Vote!'));
        await interaction.reply({ embeds: [userEmbed], flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    },
};
