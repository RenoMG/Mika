const { SlashCommandBuilder, channelMention } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const { stripIndents } = require("common-tags");
const configurationDB = require("../../Models/ConfigurationDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clears messages.')
        .addNumberOption(option => option.setName("amount").setRequired(true).setDescription("amount of messages to clear."))
        .addUserOption(option => option.setName("target").setDescription("Target to delete messages from.")),
    permissions: [Permissions.FLAGS.MANAGE_MESSAGES],

    async execute(interaction, client) {
        const { channel, options } = interaction;
        const Amount = options.getNumber("amount");
        const Target = interaction.options.getMember('target');
        const Messages = await channel.messages.fetch();
        const Response = new MessageEmbed()
            .setColor("GREEN");

        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.ModerationCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, ephemeral: true })
            
            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, ephemeral: true })

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
                    Response.setTitle(`CLEAR`).setColor("GREEN").setDescription(`Cleared ${messages.size} messages from ${Target}`).setTimestamp().setFooter({ text: "Rodger | 🆑 clear", iconURL: `${process.env.RODGERICON}` });
                    interaction.reply({ embeds: [Response] });
                })
            } else {
                await channel.bulkDelete(Amount, true).then(messages => {
                    Response.setTitle(`CLEAR`).setColor("GREEN").setDescription(`Cleared ${messages.size} messages.`).setTimestamp().setFooter({ text: "Rodger | 🆑 clear", iconURL: `${process.env.RODGERICON}` });
                    interaction.reply({ embeds: [Response] });
                })
            }
        })
    },
};
