const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, guild) {
            
        configurationDB.findOne({ GuildID: member.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.FarewellStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                farewellchannelfind = (data.FarewellChannel.map((w) => w.Channel))
                farewellmessagecontent = (data.FarewellMessage.map((w) => w.Message))

                return member.guild.channels.cache.get(`${farewellchannelfind}`).send(`${farewellmessagecontent}`.replace(/{userd}/gi, `${member.displayName}`.replace(/{user}/gi, `<@${member.user.id}>`)))
            }

        })

        configurationDB.findOne({ GuildID: member.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const logEmbed = new MessageEmbed()
                .setTitle("USER LEAVE")
                .setThumbnail(member.displayAvatarURL())
                .setColor("RED")
                .addField('**~** Account information', stripIndents`• ID: ${member.user.id}
              • Username: ${member.user.username}
              • Discord Tag: ${member.user.tag}
              • Created at: ${member.user.createdAt.toLocaleString()}`, false)
                .setTimestamp()
                .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                return member.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};