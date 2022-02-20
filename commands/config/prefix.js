const fs = require("fs");
const Keyv = require('keyv');
const {
  config
} = require("dotenv");
config({
  path: __dirname + "/.env"
});
const globalPrefix = '.';
const prefixes = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setprefix' });

module.exports = {
  name: "prefix",
  category: "config",
  description: "Changes server prefix",
  usage: "<args>",
  run: async (client, message, args) => {

    if (!message.member.hasPermission("ADMINISTRATOR")) {
      return message.reply("Changing the server prefix requires the `ADMINISTRATOR` permission!");
    }

    // if there's at least one argument, set the prefix
    if (args.length) {
      await prefixes.set(message.guild.id, args[0]);
      return message.channel.send(`Prefix has been set to \`${args[0]}\``);
    }

    return message.channel.send(`Current prefix is \`${await prefixes.get(message.guild.id) || globalPrefix}\` use ${await prefixes.get(message.guild.id) || globalPrefix}prefix followed by a new prefix to change it.`);
  }

}
