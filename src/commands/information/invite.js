const { inviteUrl } = require('../../utils/invite');
const { finish: finishReply } = require('../../utils/ack');
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
            .addFields({ name: '**Here is my invite link!** ', value: `❤ ❤ [Add me!](${inviteUrl()}) ❤ ❤`, inline: false })
            .setTimestamp()
            .setFooter(footer('Mika | ➕ Invite!'));
        await finishReply(interaction, { embeds: [userEmbed], flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    },
};
