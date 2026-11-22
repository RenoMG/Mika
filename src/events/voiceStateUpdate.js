const { Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const { getGuildConfig } = require("../utils/getGuildConfig");

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {

        getGuildConfig(newState.guild.id).then(async (data) => {
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                let oldUser = oldState.member
                let newUser = newState.member

                if (newUser.voice.channelId !== null) {

                    const logEmbed = new EmbedBuilder()
                        .setTitle("VOICE UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`${newUser} joined the voice channel <#${newUser.voice.channelId}>.`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                    return newState.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newUser.voice.channelId === null) {

                    const logEmbed = new EmbedBuilder()
                        .setTitle("VOICE UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`${newUser} left the voice channel <#${oldState.channelId}>.`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                    return newState.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                }

            }

        })

    },
};