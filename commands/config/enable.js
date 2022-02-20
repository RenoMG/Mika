const {
  MessageEmbed
} = require("discord.js")
const fs = require("fs");
const {
  stripIndents
} = require("common-tags");
const Keyv = require('keyv');
const {
  config
} = require("dotenv");
config({
  path: __dirname + "/.env"
});

const globalPrefix = '.';
const moderation = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'moderation' });
const fun = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'fun' });
const info = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'info' });
const autorolesettings = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setautorolesettings' });


module.exports = {
  name: "enable",
  aliases: ["e"],
  category: "config",
  description: "Enable command blocks",
  usage: "<args>",
  run: async (client, message, args) => {
    const clearArray = message.content.split(" ");
    const clearArgs = clearArray.slice(1);

    var imagedata = (`${message.guild.iconURL()}` || 'https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png');
    var res = imagedata.replace("null", "https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png");

    if (clearArgs[0] === 'autorole') {
      // No author permissions
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to enable command blocks!");
      autoroleenable = (`${await autorolesettings.set(message.guild.id, 'true')}`);
      return message.reply("Auto role is now enabled!");

    };

    if (clearArgs[0] === 'moderation') {
      // No author permissions
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to enable command blocks!");
      moderationenable = (`${await moderation.set(message.guild.id, 'true')}`);
      return message.reply("Moderation commands now enabled!");

    };

    if (clearArgs[0] === 'fun') {
      // No author permissions
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to enable command blocks!");
      moderationenable = (`${await fun.set(message.guild.id, 'true')}`);
      return message.reply("Fun commands now enabled!");

    };

    if (clearArgs[0] === 'info') {
      // No author permissions
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to enable command blocks!");
      moderationenable = (`${await info.set(message.guild.id, 'true')}`);
      return message.reply("Info commands now enabled!");

    };

    moderationvalue0 = (`${await moderation.get(message.guild.id)}`);
    var moderationvalue1 = moderationvalue0.replace("undefined", "true");
    infovalue0 = (`${await info.get(message.guild.id)}`);
    var infovalue1 = infovalue0.replace("undefined", "true");
    funvalue0 = (`${await fun.get(message.guild.id)}`);
    var funvalue1 = funvalue0.replace("undefined", "true");
    autorolevalue0 = (`${await autorolesettings.get(message.guild.id)}`);
    var autorolevalue1 = autorolevalue0.replace("undefined", "false");

    const embed = new MessageEmbed()
      .setColor("RED")
      .setTitle("ENABLE COMMANDS")
      .addField(`**Command statuses**`,
        stripIndents`
                  • Moderation commands enabled?: '\`${moderationvalue1}\`'
                  • Fun commands enabled?: '\`${funvalue1}\`'
                  • Info commands enabled?: '\`${infovalue1}\`'
                  • Auto role enabled?: '\`${autorolevalue1}\`'`, false)
      .setTimestamp()
      .setFooter("Rodger | 🔧 Enable!", `${res}`)

    return message.channel.send(embed);
  }

}
