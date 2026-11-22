const { Colors, EmbedBuilder } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");


module.exports = {
    name: 'guildScheduledEventUpdate',
    async execute(oldGuildScheduledEvent, newGuildScheduledEvent) {

        configurationDB.findOne({ GuildID: oldGuildScheduledEvent.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await oldGuildScheduledEvent.guild.fetchAuditLogs({
                    limit: 1,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor, changes, extra, action } = channelCreateLog;

                const dateconvert1 = new Date(oldGuildScheduledEvent.scheduledStartTimestamp).toLocaleString()
                const dateconvert2 = new Date(oldGuildScheduledEvent.scheduledEndTimestamp).toLocaleString()
                const dateconvert3 = new Date(newGuildScheduledEvent.scheduledStartTimestamp).toLocaleString()
                const dateconvert4 = new Date(newGuildScheduledEvent.scheduledEndTimestamp).toLocaleString()

                const logEmbed = new EmbedBuilder()
                .setTitle("GUILD EVENT UPDATED")
                .setColor(Colors.Yellow)
                .setDescription(`User ${executor} has updated the event **${newGuildScheduledEvent.name}**.\n\n**Original**\n**Event information**:\n• Event ID: ${oldGuildScheduledEvent.id}\n• Description: ${oldGuildScheduledEvent.description}\n• Type: ${oldGuildScheduledEvent.entityType.replace(/STAGE_INSTANCE/gi, "Stage event.").replace(/VOICE/gi, "Voice event.").replace(/EXTERNAL/gi, "External event.")}\n• Start date: ${dateconvert1}\n• End date: ${dateconvert2}\n\n**Updated**\n**Event information**:\n• Event ID: ${newGuildScheduledEvent.id}\n• Description: ${newGuildScheduledEvent.description}\n• Type: ${newGuildScheduledEvent.entityType.replace(/STAGE_INSTANCE/gi, "Stage event.").replace(/VOICE/gi, "Voice event.").replace(/EXTERNAL/gi, "External event.")}\n• Start date: ${dateconvert3}\n• End date: ${dateconvert4}`)
                .setTimestamp()
                .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                return oldGuildScheduledEvent.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};