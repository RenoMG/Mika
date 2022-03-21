const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");

module.exports = {
    name: 'messageDelete',
    async execute(message) {

        configurationDB.findOne({ GuildID: message.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const logEmbed = new MessageEmbed()
                .setTitle("MESSAGE DELETE")
                .setColor("RED")
                .setDescription(`[Message](${message.url}) by ${message.author} was deleted in ${message.channel}.\n\n**Message**:\n${message.content ? message.content : "None"}`.slice("0", "4096"))
                .setTimestamp()
                .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                if (message.attachments.size >=1) {
                    logEmbed.addField(`Attachments:`, `${message.attachments.map(a => a.url)}`, true)
                }

                return message.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};