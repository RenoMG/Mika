const { SlashCommandBuilder, roleMention } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");

module.exports = {
    name: 'roleCreate',
    async execute(role) {

        configurationDB.findOne({ GuildID: role.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await role.guild.fetchAuditLogs({
                    limit: 1,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor, changes, extra, action } = channelCreateLog;


                    const logEmbed = new MessageEmbed()
                        .setTitle("ROLE CREATED")
                        .setColor("YELLOW")
                        .setDescription(`${executor} created the role **${role.name}**.\n\n**Role information**:\n• Role ID: ${role.id}\n• Hoisted: ${role.hoisted ? "Yes" : "No"}\n• Mentionable: ${role.mentionable ? "Yes" : "No"}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return role.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

            }

        })

    },
};