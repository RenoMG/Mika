const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");


module.exports = {
    name: 'channelPinsUpdate',
    async execute(channel) {

        configurationDB.findOne({ GuildID: channel.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await channel.guild.fetchAuditLogs({
                    limit: 1,
                    type: 'MESSAGE',
                });

                const channelPinUpdateLog = fetchedLogs.entries.first();

                const { executor, target, action, extra} = channelPinUpdateLog;

                if (action === 'MESSAGE_PIN') {

                    const logEmbed = new MessageEmbed()
                        .setTitle("PIN CREATE")
                        .setColor("RED")
                        .setDescription(`User ${executor} has pinned a message in <#${extra.channel.id}>.`)
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });


                    return channel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                } else {

                    const logEmbed1 = new MessageEmbed()
                    .setTitle("PIN DELETE")
                    .setColor("RED")
                    .setDescription(`User ${executor} has removed a pinned message in <#${extra.channel.id}>.`)
                    .setTimestamp()
                    .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });


                return channel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed1] })
                }
            }

        })

    },
};