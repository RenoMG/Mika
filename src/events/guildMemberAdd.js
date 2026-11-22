const { Colors, EmbedBuilder } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");


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

        configurationDB.findOne({ GuildID: member.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.AutoroleStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                getrole = (data.AutoroleRole.map((w) => w.Role))

                return member.roles.add(getrole);
            }

        })

        configurationDB.findOne({ GuildID: member.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const logEmbed = new EmbedBuilder()
                .setTitle("USER JOIN")
                .setThumbnail(member.displayAvatarURL())
                .setColor(Colors.Green)
                .addFields({ name: '**~** Account information', value: stripIndents`• ID: ${member.user.id}
              • Username: ${member.user.username}
              • Discord Tag: ${member.user.tag}
              • Created at: ${member.user.createdAt.toLocaleString()}`, inline: false })
                .setTimestamp()
                .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                return member.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};