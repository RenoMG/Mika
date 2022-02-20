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
  name: "hackban",
  category: "moderation",
  description: "bans the member",
  usage: "<id | mention>",
  run: async (client, message, args) => {

    try {

      const logChannel = message.guild.channels.cache.find(c => c.name === "rodger-logs");

      // No args
      if (!args[0]) {
        return message.reply("Please enter a user to ban.");
      }

      // No author permissions
      if (!message.member.hasPermission("BAN_MEMBERS")) {
        return message.reply("You are missing some permissions...");

      }
      // No bot permissions
      if (!message.guild.me.hasPermission("BAN_MEMBERS")) {
        return message.reply("I am missing some permissions...");
      }

      const toBan = args[0]

      // No member found
      if (!toBan) {
        return message.reply("Member not found...");
      }

      // Can't ban urself
      if (toBan.id === message.author.id) {
        return message.reply("Hmm you want to ban yourself? Well too bad!");
      }

      const embed = new MessageEmbed()
        .setTitle("HACK BAN")
        .setColor("#ff0000")
        .setFooter(message.member.displayName)
        .setTimestamp()
        .setDescription(stripIndents`**~ banned user ID:** ${args[0]}
            **~ banned by:** ${message.member} (${message.member.id})`);

      const logembed = new MessageEmbed()
        .setTitle("LOG - Hack Ban")
        .setColor("#ff0000")
        .setFooter(message.member.displayName)
        .setTimestamp()
        .setDescription(stripIndents`**~ banned user ID:** ${args[0]}
            **~ banned by:** ${message.member} (${message.member.id})`);

      const promptEmbed = new MessageEmbed()
        .setColor("GREEN")
        .setAuthor(`Expires in 30s.`)
        .setDescription(`Ban ${args[0]}?`)

      // Send the message
      await message.channel.send(promptEmbed).then(async msg => {
        // Await the reactions and the reactioncollector
        const emoji = await promptMessage(msg, message.author, 30, ["👍", "👎"]);

        // Verification stuffs
        if (emoji === "👍") {
          msg.delete();

          message.guild.members.ban(args.slice(0).join(" "))
            .catch(err => {
              if (err) return message.channel.send(`Something went wrong... Is the user ID correct?`)
            });

          logchannelfind = `${await logchannels.get(message.guild.id)}`;
          logchannelname = message.guild.channels.cache.find(channel => channel.name === `${logchannelfind}`);
          message.channel.send(embed);
          check1 = (`${await modlogging.get(message.guild.id)}`);
          if (check1.includes('false'))
            return console.log()
          logchannelname.send(logembed);
        } else if (emoji === "👎") {
          msg.delete();

          message.reply(`ban canceled.`);
        }
      });
    } catch (err) {
      console.log(err)
    }
  }
};
