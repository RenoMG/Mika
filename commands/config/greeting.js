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
const welcomemsg = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setwelcomemsg' });
const welcomechannel = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setwelcomechannel' });
const autorole = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setautorole' });

module.exports = {
  name: "greeting",
  aliases: ["greet"],
  category: "config",
  description: "Changes server greeting settings",
  usage: "<args>",
  run: async (client, message, args) => {

    const clearArray = message.content.split(" ");
    const clearArgs = clearArray.slice(1);

    var imagedata = (`${message.guild.iconURL()}` || 'https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png');
    var res = imagedata.replace("null", "https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png");

    const helpembed = new MessageEmbed()
      .setColor("RED")
      .setTitle("GREETING COMMAND HELP")
      .addField(`**Commands**`,
        stripIndents`
            • ${await prefixes.get(message.guild.id) || globalPrefix}greeting help
            • ${await prefixes.get(message.guild.id) || globalPrefix}greeting channel "name"
            • ${await prefixes.get(message.guild.id) || globalPrefix}greeting message "message"
            • ${await prefixes.get(message.guild.id) || globalPrefix}greeting autorole "rolename(plain text)"
            • Use {user} to mention or {userd} to print users name.`, false)
      .setTimestamp()
      .setFooter("Rodger | 👋 Greeting!", `${res}`)

    if (clearArgs[0] === 'help') {
      return message.channel.send(helpembed);
    };

    if (clearArgs[0] === 'autorole') {
      // No author permissions
      if (args.length < 2)
        return message.reply("Please enter a role name!")
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to change the auto role!");
      setgreetchannel = (`${await autorole.set(message.guild.id, args.slice(1).join(" "))}`);
      return message.reply(`Auto role now set to \`${args.slice(1).join(" ")}\``);
    };

    if (clearArgs[0] === 'channel') {
      // No author permissions
      if (args.length < 2)
        return message.reply("Please enter a channel!")
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to change the greeting channel!");
      setgreetchannel = (`${await welcomechannel.set(message.guild.id, args.slice(1).join(" "))}`);
      return message.reply(`Welcome channel now set to \`${args.slice(1).join(" ")}\``);
    };

    if (clearArgs[0] === 'message') {
      // No author permissions
      if (args.length < 2)
        return message.reply("Please enter a message!")
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to change the greeting message!");
      setgreetmessage = (`${await welcomemsg.set(message.guild.id, args.slice(1).join(" "))}`);
      return message.reply(`Welcome message now set to \`${args.slice(1).join(" ")}\``);
    };

    channelvalue0 = (`${await welcomechannel.get(message.guild.id)}`);
    var channelvalue1 = channelvalue0.replace("undefined", "rodger-welcome");
    messagevalue0 = (`${await welcomemsg.get(message.guild.id)}`);
    var messagevalue1 = messagevalue0.replace("undefined", "Welcome {user} to our server!");
    autorolevalue0 = (`${await autorole.get(message.guild.id)}`);
    var autorolevalue1 = autorolevalue0.replace("undefined", "Role not set");


    const embed = new MessageEmbed()
      .setColor("RED")
      .setTitle("GREETING STATUS")
      .addField(`**Greet value statuses**`,
        stripIndents`
                        • Current greeting channel?: '\`${channelvalue1}\`'
                        • Current greeting message?: '\`${messagevalue1}\`'
                        • Current auto role?: '\`${autorolevalue1}\`'`, false)
      .setTimestamp()
      .setFooter("Rodger | 👋 Greeting!", `${res}`)

    message.channel.send(embed);
    return message.channel.send(`Use ${await prefixes.get(message.guild.id) || globalPrefix}greeting help for the command list.`);
  }

}
