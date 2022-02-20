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
const warncount = new Keyv(`${process.env.SERVERSTATSKEYV}`, { namespace: 'warncount' });
const modlogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'modlogging' });

module.exports = {
  name: "warn",
  category: "moderation",
  description: "Warns mentioned user",
  usage: "<id | mention>",
  run: async (client, message, args) => {

    try {

      const logChannel = message.guild.channels.cache.find(c => c.name === "rodger-logs");

      //No mention
      if (!args[0]) {
        return message.reply("Please enter a user to warn.");
      }

      //No author permissions
      if (!message.member.hasPermission("KICK_MEMBERS")) {
        return message.reply("You are missing the `KICK_MEMBERS` permission.");
      }

      //No bot permissions
      if (!message.guild.me.hasPermission("KICK_MEMBERS")) {
        return message.reply("I am missing the `KICK_MEMBERS` permission.");
      }

      const toWarn = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

      //No member found
      if (!toWarn) {
        return message.reply("Member not found...");
      }

      //Can't kick yourself
      if (message.author.id === toWarn.id) {
        return message.reply("Hmm you want to warn yourself? Well too bad!");
      }

      //Is kickable
      if (!toWarn.kickable) {
        return message.reply("Looks like your role is to low to warn them... oh well.");
      }

      const embed = new MessageEmbed()
        .setTitle("WARN")
        .setColor("#fff200")
        .setThumbnail(toWarn.user.displayAvatarURL())
        .setFooter(message.member.displayName, message.author.displayAvatarURL())
        .setTimestamp()
        .setDescription(stripIndents`**~ Warned member:** ${toWarn} (${toWarn.id})
        **~ Warned by:** ${message.author} (${message.author.id})
        **~ Reason:** ${args.slice(1).join(" ")}`);

      const logembed = new MessageEmbed()
        .setTitle("LOG - Warn")
        .setColor("#fff200")
        .setThumbnail(toWarn.user.displayAvatarURL())
        .setFooter(message.member.displayName, message.author.displayAvatarURL())
        .setTimestamp()
        .setDescription(stripIndents`**~ Warned member:** ${toWarn} (${toWarn.id})
        **~ Warned by:** ${message.author} (${message.author.id})
        **~ Reason:** ${args.slice(1).join(" ")}`);

      logchannelfind = `${await logchannels.get(message.guild.id)}`;
      logchannelname = message.guild.channels.cache.find(channel => channel.name === `${logchannelfind}`);
      warnreason = `${args.slice(1).join(" ")}`
      warncount0 = (`${await warncount.get(toWarn.id + message.guild.id)}`);
      var warncount1 = warncount0.replace("undefined", "0");

      function newCount() {
        return ++warncount1;
      }
      warns = `${await warncount.set(toWarn.id + message.guild.id, `${newCount()}`)}`;

      message.channel.send(embed);
      check1 = (`${await modlogging.get(message.guild.id)}`);
      if (check1.includes('false'))
        return console.log()
      logchannelname.send(logembed);
    } catch (err) {
      return;
    }

  }
}
