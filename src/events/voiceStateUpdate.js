const { SlashCommandBuilder, roleMention } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {

        configurationDB.findOne({ GuildID: newState.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                let oldUser = oldState.member
                let newUser = newState.member

                if (newUser.voice.channelId !== null) {

                    const logEmbed = new MessageEmbed()
                        .setTitle("VOICE UPDATE")
                        .setColor("YELLOW")
                        .setDescription(`${newUser} joined the voice channel <#${newUser.voice.channelId}>.`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return newState.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newUser.voice.channelId === null) {

                    const logEmbed = new MessageEmbed()
                        .setTitle("VOICE UPDATE")
                        .setColor("YELLOW")
                        .setDescription(`${newUser} left the voice channel <#${oldState.channelId}>.`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return newState.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                }

            }

        })

    },
};