const { Colors, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { stripIndents } = require("common-tags");
module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clears messages.')
        .addNumberOption(option => option.setName("amount").setRequired(true).setDescription("amount of messages to clear."))
        .addUserOption(option => option.setName("target").setDescription("Target to delete messages from.")),
        PermissionFlagsBits.ManageMessages),
    category: 'moderation',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/clear amount:5',
    permissions: [PermissionFlagsBits.ManageMessages],

    async execute(interaction, client) {
        const { channel, options } = interaction;
        const Amount = options.getNumber("amount");
        const Target = interaction.options.getMember('target');
        const Messages = await channel.messages.fetch();
        const Response = new EmbedBuilder()
            .setColor(Colors.Green);

        if (Target) {
                let i = 0;
                const filtered = [];
                (await Messages).filter((m) => {
                    if (m.author.id === Target.id && Amount > i) {
                        filtered.push(m);
                        i++;
                    }
                })
                await channel.bulkDelete(filtered, true).then(messages => {
                    Response.setTitle(`CLEAR`).setColor(Colors.Green).setDescription(`Cleared ${messages.size} messages from ${Target}`).setTimestamp().setFooter({ text: "Mika | 🆑 clear", iconURL: `${process.env.MIKAICON}` });
                    interaction.reply({ embeds: [Response] });
                })
            } else {
                await channel.bulkDelete(Amount, true).then(messages => {
                    Response.setTitle(`CLEAR`).setColor(Colors.Green).setDescription(`Cleared ${messages.size} messages.`).setTimestamp().setFooter({ text: "Mika | 🆑 clear", iconURL: `${process.env.MIKAICON}` });
                    interaction.reply({ embeds: [Response] });
                })
            }
    },
};
