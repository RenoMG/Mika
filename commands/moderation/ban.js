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
const {
  config
} = require("dotenv");
config({
  path: __dirname + "/.env"
});

const logchannels = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setlogchannels' });
const bancount = new Keyv(`${process.env.SERVERSTATSKEYV}`, { namespace: 'bancount' });
const modlogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'modlogging' });

module.exports = {
  name: "ban",
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
        return message.reply("You are missing the `BAN_MEMBERS` permission.");

      }
      // No bot permissions
      if (!message.guild.me.hasPermission("BAN_MEMBERS")) {
        return message.reply("I am missing the `BAN_MEMBERS` permission.");
      }

      const toBan = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

      // No member found
      if (!toBan) {
        return message.reply("Member not found...");
      }

      // Can't ban urself
      if (toBan.id === message.author.id) {
        return message.reply("Hmm you want to ban yourself? Well too bad!");
      }

      // Check if the user's banable
      if (!toBan.bannable) {
        return message.reply("Looks like your role is to low to ban them... oh well.");
      }

      const embed = new MessageEmbed()
        .setTitle("BAN")
        .setColor("#ff0000")
        .setThumbnail(toBan.user.displayAvatarURL())
        .setFooter(message.member.displayName, message.author.displayAvatarURL())
        .setTimestamp()
        .setDescription(stripIndents`**~ banned member:** ${toBan} (${toBan.id})
            **~ banned by:** ${message.member} (${message.member.id})
            **~ Reason:** ${args.slice(1).join(" ")}`);

      const logembed = new MessageEmbed()
        .setTitle("LOG - Ban")
        .setColor("#ff0000")
        .setThumbnail(toBan.user.displayAvatarURL())
        .setFooter(message.member.displayName, message.author.displayAvatarURL())
        .setTimestamp()
        .setDescription(stripIndents`**~ banned member:** ${toBan} (${toBan.id})
          **~ banned by:** ${message.member} (${message.member.id})
          **~ Reason:** ${args.slice(1).join(" ")}`);

      const promptEmbed = new MessageEmbed()
        .setColor("GREEN")
        .setAuthor(`Expires in 30s.`)
        .setDescription(`Ban ${toBan}?`)

      // Send the message
      await message.channel.send(promptEmbed).then(async msg => {
        // Await the reactions and the reactioncollector
        const emoji = await promptMessage(msg, message.author, 30, ["👍", "👎"]);

        // Verification stuffs
        if (emoji === "👍") {
          msg.delete();

          toBan.ban({ days: 0, reason: `${args.slice(1).join(" ")}` })
            .catch(err => {
              if (err) return message.channel.send(`Something went wrong...`)
            });

          logchannelfind = `${await logchannels.get(message.guild.id)}`;
          logchannelname = message.guild.channels.cache.find(channel => channel.name === `${logchannelfind}`);
          bancount0 = (`${await bancount.get(toBan.id + message.guild.id)}`);
          var bancount1 = bancount0.replace("undefined", "0");

          function newCount() {
            return ++bancount1;
          }
          bans = `${await bancount.set(toBan.id + message.guild.id, `${newCount()}`)}`;
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
