const {
  MessageEmbed
} = require("discord.js");
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
  name: "unban",
  category: "moderation",
  description: "unbans the member",
  usage: "<id | mention>",
  run: async (client, message, args) => {

    try {
      const logChannel = message.guild.channels.cache.find(c => c.name === "rodger-logs");

      // No args
      if (!args[0]) {
        return message.reply("Please enter a user to unban.");
      }

      // No author permissions
      if (!message.member.hasPermission("BAN_MEMBERS")) {
        return message.reply("You are missing the `BAN_MEMBERS` permission.");

      }
      // No bot permissions
      if (!message.guild.me.hasPermission("BAN_MEMBERS")) {
        return message.reply("I am missing the `BAN_MEMBERS` permission..");
      }

      const tounBan = args[0]

      // No member found
      if (!tounBan) {
        return message.reply("Member not found...");
      }

      // Can't ban urself
      if (tounBan.id === message.author.id) {
        return message.reply("Hmm you want to unban yourself? Well idk how that would work...");
      }

      const embed = new MessageEmbed()
        .setTitle("UNBAN")
        .setColor("#ff0000")
        .setFooter(message.member.displayName)
        .setTimestamp()
        .setDescription(stripIndents`**~ unbanned user ID:** ${args[0]}
            **~ unbanned by:** ${message.member} (${message.member.id})`);

      const logembed = new MessageEmbed()
        .setTitle("LOG - UnBan")
        .setColor("#ff0000")
        .setFooter(message.member.displayName)
        .setTimestamp()
        .setDescription(stripIndents`**~ unbanned user ID:** ${args[0]}
            **~ unbanned by:** ${message.member} (${message.member.id})`);

      const promptEmbed = new MessageEmbed()
        .setColor("GREEN")
        .setAuthor(`Expires in 30s.`)
        .setDescription(`UnBan ${args[0]}?`)

      // Send the message
      await message.channel.send(promptEmbed).then(async msg => {
        // Await the reactions and the reactioncollector
        const emoji = await promptMessage(msg, message.author, 30, ["👍", "👎"]);

        // Verification stuffs
        if (emoji === "👍") {
          msg.delete();

          message.guild.members.unban(args.slice(0).join(" "))
            .catch(err => {
              if (err) return message.channel.send(`Something went wrong... Is the user ID correct?`)
            });

          logchannelfind = `${await logchannels.get(message.guild.id)}`;
          logchannelname = message.guild.channels.cache.find(channel => channel.name === `${logchannelfind}`);
          message.channel.send(embed);
          check1 = (`${await modlogging.cache.get(message.guild.id)}`);
          if (check1.includes('false'))
            return console.log()
          logchannelname.send(logembed);
        } else if (emoji === "👎") {
          msg.delete();

          message.reply(`unban canceled.`);
        }
      });
    } catch (err) {
      return;
    }
  }
};
