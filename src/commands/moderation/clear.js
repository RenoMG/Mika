const { Colors, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const configurationDB = require("../../Models/ConfigurationDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clears messages.')
        .addNumberOption(option => option.setName("amount").setRequired(true).setDescription("amount of messages to clear."))
        .addUserOption(option => option.setName("target").setDescription("Target to delete messages from.")),
    permissions: [PermissionFlagsBits.ManageMessages],

    async execute(interaction, client) {
        const { channel, options } = interaction;
        const Amount = options.getNumber("amount");
        const Target = interaction.options.getMember('target');
        const Messages = await channel.messages.fetch();
        const Response = new EmbedBuilder()
            .setColor(Colors.Green);

        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.ModerationCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, flags: MessageFlags.Ephemeral })
            
            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (Target) {
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
        })
    },
};
