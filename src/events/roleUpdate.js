const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");

module.exports = {
    name: 'roleUpdate',
    async execute(oldRole, newRole) {

        configurationDB.findOne({ GuildID: oldRole.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await oldRole.guild.fetchAuditLogs({
                    limit: 1,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor, changes, extra, action } = channelCreateLog;

                if (newRole.name !== oldRole.name) {

                    const logEmbed = new MessageEmbed()
                        .setTitle("ROLE UPDATE")
                        .setColor("YELLOW")
                        .setDescription(`${executor} updated the role name for <@&${newRole.id}>.\n\n**Original**:\n${oldRole.name}\n\n**Updated**:\n${newRole.name}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldRole.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newRole.color !== oldRole.color) {
                    const logEmbed = new MessageEmbed()
                        .setTitle("ROLE UPDATE")
                        .setColor("YELLOW")
                        .setDescription(`${executor} updated the role color for <@&${newRole.id}>.\n\n**Original**:\n#${oldRole.color.toString(16)}\n\n**Updated**:\n#${newRole.color.toString(16)}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldRole.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newRole.hoist !== oldRole.hoist) {
                    let oldHoist = oldRole.hoist ? 'Yes' : 'No'
                    let newHoist = newRole.hoist ? 'Yes' : 'No'

                    const logEmbed = new MessageEmbed()
                        .setTitle("ROLE UPDATE")
                        .setColor("YELLOW")
                        .setDescription(`${executor} updated the role hoist for <@&${newRole.id}>.\n\n**Original**:\n${oldHoist}\n\n**Updated**:\n${newHoist}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldRole.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newRole.mentionable !== oldRole.mentionable) {
                    let oldMentionable = oldRole.mentionable ? 'Yes' : 'No'
                    let newMentionable = newRole.mentionable ? 'Yes' : 'No'

                    const logEmbed = new MessageEmbed()
                        .setTitle("ROLE UPDATE")
                        .setColor("YELLOW")
                        .setDescription(`${executor} updated the role mention status for <@&${newRole.id}>.\n\n**Original**:\n${oldMentionable}\n\n**Updated**:\n${newMentionable}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldRole.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                }
            }

        })

    },
};