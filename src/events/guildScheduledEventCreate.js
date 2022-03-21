const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");


module.exports = {
    name: 'guildScheduledEventCreate',
    async execute(guildScheduledEventCreate) {

        configurationDB.findOne({ GuildID: guildScheduledEventCreate.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const dateconvert1 = new Date(guildScheduledEventCreate.scheduledStartTimestamp).toLocaleString()
                const dateconvert2 = new Date(guildScheduledEventCreate.scheduledEndTimestamp).toLocaleString()

                const logEmbed = new MessageEmbed()
                .setTitle("GUILD EVENT CREATED")
                .setColor("YELLOW")
                .setDescription(`User <@!${guildScheduledEventCreate.creatorId}> has created the event **${guildScheduledEventCreate.name}**.\n\n**Event information**:\n• Event ID: ${guildScheduledEventCreate.id}\n• Description: ${guildScheduledEventCreate.description}\n• Type: ${guildScheduledEventCreate.entityType.replace(/STAGE_INSTANCE/gi, "Stage event.").replace(/VOICE/gi, "Voice event.").replace(/EXTERNAL/gi, "External event.")}\n• Start date: ${dateconvert1}\n• End date: ${dateconvert2}`)
                .setTimestamp()
                .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });


                return guildScheduledEventCreate.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};