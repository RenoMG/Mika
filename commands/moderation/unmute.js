const {
  MessageEmbed
} = require("discord.js")
const {
  stripIndents
} = require("common-tags");
const {
  promptMessage
} = require("../../functions.js");
const Keyv = require('keyv');

const logchannels = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setlogchannels' });
const modlogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'modlogging' });

module.exports = {
  name: "unmute",
  category: "moderation",
  description: "unMutes user",
  usage: "<id | mention>",
  run: async (client, message, args, guild, member) => {

    try {

      //const logchannelname = `${await logchannels.get(message.guild.id)}`;

      //No mention
      if (!args[0]) {
        return message.reply("Please enter a user to unmute.");
      }

      //No author permissions
      if (!message.member.hasPermission("MANAGE_ROLES")) {
        return message.reply("You are missing the `MANAGE_ROLES` permission.");
      }

      //No bot permissions
      if (!message.guild.me.hasPermission("MANAGE_ROLES")) {
        return message.reply("I am missing the `MANAGE_ROLES` permission.");
      }

      const toMute = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

      //Check for Muted role add if not made
      let muterole = message.guild.roles.cache.find(r => r.name === "Muted")
      if (!muterole) {
        try {
          muterole = await message.guild.roles.create({
            name: "Muted",
            color: "#838383",
            permissions: []
          })


        } catch (err) {
          console.log(err.stack);
        }
      }

      //No member found
      if (!toMute) {
        return message.reply("Member not found...");
      }

      toMute.roles.remove(muterole.id).then(async () => {
        try {
          const embed = new MessageEmbed()
            .setTitle("UNMUTE")
            .setColor("#ffa500")
            .setThumbnail(toMute.user.displayAvatarURL())
            .setFooter(message.member.displayName, message.author.displayAvatarURL())
            .setTimestamp()
            .setDescription(stripIndents`**~ unMuted member:** ${toMute} (${toMute.id})
        **~ unMuted by:** ${message.author} (${message.author.id})`);

          const logembed = new MessageEmbed()
            .setTitle("LOG - unMute")
            .setColor("#ffa500")
            .setThumbnail(toMute.user.displayAvatarURL())
            .setFooter(message.member.displayName, message.author.displayAvatarURL())
            .setTimestamp()
            .setDescription(stripIndents`**~ unMuted member:** ${toMute} (${toMute.id})
        **~ unMuted by:** ${message.author} (${message.author.id})`);


          logchannelfind = await logchannels.get(message.guild.id)
          logchannelname = message.guild.channels.cache.find(channel => channel.name === `${logchannelfind}`);
          message.channel.send(embed);
          check1 = (`${await modlogging.get(message.guild.id)}`);
          if (check1.includes('false'))
            return;
          logchannelname.send(logembed);
        } catch (err) {
          return;
        }
      });

    } catch (err) {
      return;
    }
  }
};
