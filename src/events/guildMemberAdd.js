const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");


module.exports = {
    name: 'guildMemberAdd',
    async execute(member, guild) {

        configurationDB.findOne({ GuildID: member.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.GreetingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                greetingchannelfind = (data.GreetingChannel.map((w) => w.Channel))
                greetingmessagecontent = (data.GreetingMessage.map((w) => w.Message))

                return member.guild.channels.cache.get(`${greetingchannelfind}`).send(`${greetingmessagecontent}`.replace(/{userd}/gi, `${member.displayName}`.replace(/{user}/gi, `<@${member.user.id}>`)))
            }

        })

    },
};