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
const kickcount = new Keyv(`${process.env.SERVERSTATSKEYV}`, { namespace: 'kickcount' });
const modlogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'modlogging' });

module.exports = {
  name: "kick",
  category: "moderation",
  description: "Kicks user from server",
  usage: "<id | mention>",
  run: async (client, message, args, guild, member) => {

    try {

      //const logchannelname = `${await logchannels.get(message.guild.id)}`;

      //No mention
      if (!args[0]) {
        return message.reply("Please enter a user to kick.");
      }

      //No author permissions
      if (!message.member.hasPermission("KICK_MEMBERS")) {
        return message.reply("You are missing the `KICK_MEMBERS` permission.");
      }

      //No bot permissions
      if (!message.guild.me.hasPermission("KICK_MEMBERS")) {
        return message.reply("I am missing the `KICK_MEMBERS` permission.");
      }

      const toKick = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

      //No member found
      if (!toKick) {
        return message.reply("Member not found...");
      }

      //Can't kick yourself
      if (message.author.id === toKick.id) {
        return message.reply("Hmm you want to kick yourself? Well too bad!");
      }

      //Is kickable
      if (!toKick.kickable) {
        return message.reply("Looks like your role is to low to kick them... oh well.");
      }

      const embed = new MessageEmbed()
        .setTitle("KICK")
        .setColor("#ffa500")
        .setThumbnail(toKick.user.displayAvatarURL())
        .setFooter(message.member.displayName, message.author.displayAvatarURL())
        .setTimestamp()
        .setDescription(stripIndents`**~ Kicked member:** ${toKick} (${toKick.id})
        **~ Kicked by:** ${message.author} (${message.author.id})
        **~ Reason:** ${args.slice(1).join(" ")}`);

      const logembed = new MessageEmbed()
        .setTitle("LOG - Kick")
        .setColor("#ffa500")
        .setThumbnail(toKick.user.displayAvatarURL())
        .setFooter(message.member.displayName, message.author.displayAvatarURL())
        .setTimestamp()
        .setDescription(stripIndents`**~ Kicked member:** ${toKick} (${toKick.id})
        **~ Kicked by:** ${message.author} (${message.author.id})
        **~ Reason:** ${args.slice(1).join(" ")}`);

      const promptEmbed = new MessageEmbed()
        .setColor("GREEN")
        .setAuthor("Expires in 30s")
        .setDescription(`Kick ${toKick}?`);

      message.channel.send(promptEmbed).then(async msg => {
        const emoji = await promptMessage(msg, message.author, 30, ["👍", "👎"]);

        if (emoji === "👍") {
          msg.delete();

          toKick.kick(args.slice(1).join(" "))
            .catch(err => {
              if (err) return message.channel.send(`Something went wrong...`);
            });

          logchannelfind = `${await logchannels.get(message.guild.id)}`;
          logchannelname = message.guild.channels.cache.find(channel => channel.name === `${logchannelfind}`);
          kickcount0 = (`${await kickcount.get(toKick.id + message.guild.id)}`);
          var kickcount1 = kickcount0.replace("undefined", "0");

          function newCount() {
            return ++kickcount1;
          }
          kicks = `${await kickcount.set(toKick.id + message.guild.id, `${newCount()}`)}`;
          message.channel.send(embed);
          check1 = (`${await modlogging.get(message.guild.id)}`);
          if (check1.includes('false'))
            try {
              return;
              logchannelname.send(logembed);
            }
            catch (err) {
              return;
            }
        } else if (emoji === "👎") {
          msg.delete();
          message.reply("Kick canceled...");

        }
      });
    } catch (err) {
      return;
    }


  }
};
