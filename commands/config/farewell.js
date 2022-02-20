const {
  MessageEmbed
} = require("discord.js")
const fs = require("fs");
const Keyv = require('keyv');
const {
  stripIndents
} = require("common-tags");
const {
  config
} = require("dotenv");
config({
  path: __dirname + "/.env"
});

const globalPrefix = '.';
const prefixes = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setprefix' });
const goodbyemsg = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setgoodbyemsg' });
const goodbyechannel = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setgoodbyechannel' });

module.exports = {
  name: "farewell",
  aliases: [],
  category: "config",
  description: "Changes server farewell settings",
  usage: "<args>",
  run: async (client, message, args) => {

    const clearArray = message.content.split(" ");
    const clearArgs = clearArray.slice(1);

    var imagedata = (`${message.guild.iconURL()}` || 'https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png');
    var res = imagedata.replace("null", "https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png");

    const helpembed = new MessageEmbed()
      .setColor("RED")
      .setTitle("FAREWELL COMMAND HELP")
      .addField(`**Commands**`,
        stripIndents`
            • ${await prefixes.get(message.guild.id) || globalPrefix}farewell help
            • ${await prefixes.get(message.guild.id) || globalPrefix}farewell channel "name"
            • ${await prefixes.get(message.guild.id) || globalPrefix}farewell message "message"
            • Use {user} to mention or {userd} to print users name.`, false)
      .setTimestamp()
      .setFooter("Rodger | ✌ Farewell!", `${res}`)

    if (clearArgs[0] === 'help') {
      return message.channel.send(helpembed);
    };

    if (clearArgs[0] === 'channel') {
      // No author permissions
      if (args.length < 2)
        return message.reply("Please enter a channel!")
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to change the farewell channel!");
      setgreetchannel = (`${await goodbyechannel.set(message.guild.id, args.slice(1).join(" "))}`);
      return message.reply(`Farewell channel now set to \`${args.slice(1).join(" ")}\``);
    };

    if (clearArgs[0] === 'message') {
      // No author permissions
      if (args.length < 2)
        return message.reply("Please enter a message!")
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to change the farewell message!");
      setgreetmessage = (`${await goodbyemsg.set(message.guild.id, args.slice(1).join(" "))}`);
      return message.reply(`Farewell message now set to \`${args.slice(1).join(" ")}\``);
    };

    channelvalue0 = (`${await goodbyechannel.get(message.guild.id)}`);
    var channelvalue1 = channelvalue0.replace("undefined", "rodger-goodbye");
    messagevalue0 = (`${await goodbyemsg.get(message.guild.id)}`);
    var messagevalue1 = messagevalue0.replace("undefined", "{user} has left the server!");


    const embed = new MessageEmbed()
      .setColor("RED")
      .setTitle("FAREWELL STATUS")
      .addField(`**Farewell value statuses**`,
        stripIndents`
                        • Current farewell channel?: '\`${channelvalue1}\`'
                        • Current farewell message?:
                        '\`${messagevalue1}\`'`, false)
      .setTimestamp()
      .setFooter("Rodger | ✌ Farewell!", `${res}`)

    message.channel.send(embed);
    return message.channel.send(`Use ${await prefixes.get(message.guild.id) || globalPrefix}farewell help for the command list.`);
  }

}
