const { Colors, EmbedBuilder } = require('discord.js');
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


                    const logEmbed = new EmbedBuilder()
                        .setTitle("ROLE CREATED")
                        .setColor(Colors.Yellow)
                        .setDescription(`${executor} created the role **${role.name}**.\n\n**Role information**:\n• Role ID: ${role.id}\n• Hoisted: ${role.hoisted ? "Yes" : "No"}\n• Mentionable: ${role.mentionable ? "Yes" : "No"}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                    return role.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

            }

        })

    },
};