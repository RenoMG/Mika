const { Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const { getGuildConfig } = require("../functions/getGuildConfig");


module.exports = {
    name: 'guildScheduledEventDelete',
    async execute(guildScheduledEventDelete) {

        getGuildConfig(guildScheduledEventDelete.guild.id).then(async (data) => {
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await guildScheduledEventDelete.guild.fetchAuditLogs({
                    limit: 1,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor, changes, extra, action } = channelCreateLog;

                const dateconvert1 = new Date(guildScheduledEventDelete.scheduledStartTimestamp).toLocaleString()
                const dateconvert2 = new Date(guildScheduledEventDelete.scheduledEndTimestamp).toLocaleString()

                const logEmbed = new EmbedBuilder()
                .setTitle("GUILD EVENT CANCELED")
                .setColor(Colors.Red)
                .setDescription(`User ${executor} has canceled the event **${guildScheduledEventDelete.name}**.\n\n**Event information**:\n• Event ID: ${guildScheduledEventDelete.id}\n• Description: ${guildScheduledEventDelete.description}\n• Type: ${guildScheduledEventDelete.entityType.replace(/STAGE_INSTANCE/gi, "Stage event.").replace(/VOICE/gi, "Voice event.").replace(/EXTERNAL/gi, "External event.")}\n• Start date: ${dateconvert1}\n• End date: ${dateconvert2}`)
                .setTimestamp()
                .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                return guildScheduledEventDelete.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};