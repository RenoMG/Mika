const { SlashCommandBuilder, channelMention } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const { stripIndents } = require("common-tags");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clears messages.')
        .addNumberOption(option => option.setName("amount").setRequired(true).setDescription("amount of messages to clear."))
        .addUserOption(option => option.setName("target").setDescription("Target to delete messages from.")),
    permissions: [ Permissions.FLAGS.BAN_MEMBERS ],

    async execute(interaction, client) {
        const { channel, options } = interaction;
        const Amount = options.getNumber("amount");
        const Target = interaction.options.getMember('target');
        const Messages =  await channel.messages.fetch();
        const Response = new MessageEmbed()
        .setColor("GREEN");

        if(Target) {
            let i = 0;
            const filtered = [];
            (await Messages).filter((m) => {
                if(m.author.id === Target.id && Amount > i) {
                    filtered.push(m);
                    i++;
                }
            })
            await channel.bulkDelete(filtered, true).then(messages => {
                Response.setDescription(`Cleared ${messages.size} messages from ${Target}`);
                interaction.reply({embeds: [Response]});
            })
        } else {
            await channel.bulkDelete(Amount, true).then(messages => {
                Response.setDescription(`Cleared ${messages.size} messages.`);
                interaction.reply({embeds: [Response]});
            })
        }
    },
};
