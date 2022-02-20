const fs = require("fs");
const {
  stripIndents
} = require("common-tags");
const Keyv = require('keyv');

const globalPrefix = '.';
const server = new Keyv(`${process.env.BOTRELATEDKEYV}`, { namespace: 'setblacklist' });


module.exports = {
  name: "blacklist",
  aliases: [],
  category: "syscommands",
  description: "Add servers to blacklist",
  usage: "<args>",
  run: async (client, message, args) => {
    const clearArray = message.content.split(" ");
    const clearArgs = clearArray.slice(1);


    if (clearArgs[0] === 'remove') {
      if (message.member.id != '439289504109428736')
        return message.reply("Oops you are not a dev? lol sucks to suck.");
      serverset = (`${await server.set(`${args.slice(1)}`, 'false')}`);
      message.reply(`${args.slice(1)} is now whitelisted!`);
      return client.channels.cache.get('827708720616046683').send(`✔ \`${message.guild.name}\` **Is now Whitelisted!** GUILDID:(\`${message.guild.id}\`)`);
    };

    if (clearArgs[0] === 'add') {
      if (message.member.id != '439289504109428736')
        return message.reply("Oops you are not a dev? lol sucks to suck.");
      serverset = (`${await server.set(`${args.slice(1)}`, 'true')}`);
      message.reply(`${args.slice(1)} is now blacklisted!`);
      return client.channels.cache.get('827708720616046683').send(`❌ \`${message.guild.name}\` **Is now Blacklisted!** GUILDID:(\`${message.guild.id}\`)`);
    };

    return message.channel.send(`Please put a server id ya dummy head!`)



  }

}
