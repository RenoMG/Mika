const {
  RichEmbed
} = require("discord.js")
const fs = require("fs");
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
  name: "disable",
  aliases: ["d"],
  category: "config",
  description: "Disable command blocks",
  usage: "<args>",
  run: async (client, message, args) => {
    const clearArray = message.content.split(" ");
    const clearArgs = clearArray.slice(1);

    if (!args[0]) {
      return message.reply("Please enter a feature to disable!")
    }

    if (clearArgs[0] === 'autorole') {
      // No author permissions
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to enable command blocks!");
      autoroleenable = (`${await autorolesettings.set(message.guild.id, 'false')}`);
      return message.reply("Auto role is now disabled!");

    };

    if (clearArgs[0] === 'moderation') {
      // No author permissions
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to disable command blocks!");
      moderationenable = (`${await moderation.set(message.guild.id, 'false')}`);
      return message.reply("Moderation commands now disabled!");

    };

    if (clearArgs[0] === 'fun') {
      // No author permissions
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to disable command blocks!");
      moderationenable = (`${await fun.set(message.guild.id, 'false')}`);
      return message.reply("Fun commands now disabled!");

    };

    if (clearArgs[0] === 'info') {
      // No author permissions
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to disable command blocks!");
      moderationenable = (`${await info.set(message.guild.id, 'false')}`);
      return message.reply("Info commands now disabled!");

    };

  }

}
