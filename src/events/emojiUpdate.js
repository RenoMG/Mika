const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");


module.exports = {
    name: 'emojiUpdate',
    async execute(oldEmoji, newEmoji) {

        configurationDB.findOne({ GuildID: oldEmoji.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await oldEmoji.guild.fetchAuditLogs({
                    limit: 1,
                    type: 'CHANNEL',
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor } = channelCreateLog;

                const logEmbed = new MessageEmbed()
                .setTitle("EMOJI UPDATE")
                .setColor("YELLOW")
                .setDescription(`User ${executor} has updated the emoji ${newEmoji}.\n\n**Original**:\n${oldEmoji.name}\n\n**Updated**:\n${newEmoji.name}`.slice("0", "4096"))
                .setTimestamp()
                .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });


                return oldEmoji.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};