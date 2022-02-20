const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");
const usedCommandRecently = new Set();

module.exports = {
  name: "hammertime",
  category: "moderation",
  description: "It's HAMMERTIME!",
  run: async (client, message, args, user) => {
    try {

      if (!message.member.hasPermission("BAN_MEMBERS")) {
        return message.reply("You are missing the `BAN_MEMBERS` permission.");

      }

      const member = getMember(message, args.join(" "));

      // Member variables
      const joined = formatDate(member.joinedAt);
      const roles = member.roles
        .cache.filter(r => r.id !== message.guild.id)
        .map(r => r)
        .join(", ") || "none";

      // User variables
      const created = formatDate(member.user.createdAt);

      var options = ['https://media1.tenor.com/images/4847ef7d0031afdf5db709cd6ccea8b4/tenor.gif?itemid=5865228',
        'https://media1.tenor.com/images/4e6552a04c6d504b89425eda60fff805/tenor.gif?itemid=11499256',
        'https://media1.tenor.com/images/3e11c1f00331db944807df667fc71311/tenor.gif?itemid=9609634',
        'https://media1.tenor.com/images/ed78a690ac837cd9ed04f8a2bd53b5e9/tenor.gif?itemid=8061968',
        'https://media1.tenor.com/images/0a9586af714c6fc0f4a776cb0faf95e2/tenor.gif?itemid=8540512',
        'https://media1.tenor.com/images/d588d295136d07891a79ecc4d38e1a22/tenor.gif?itemid=10026092',
        'https://media1.tenor.com/images/5e4a4cd8a822ad1f20eac25f4868ebaa/tenor.gif?itemid=13390256'];

      var response = options[Math.floor(Math.random() * options.length)];

      //  message.channel.send(`${message.author} JUST DABBED ON ${member} `);

      const embed = new MessageEmbed()
        .setColor("RANDOM")
        .setImage(response)
        .setURL(response)
        .setTimestamp()
        .setDescription(stripIndents`**HAMMERTIME**

                ${message.author} ACTIVATED HAMMERTIME, BAN INCOMING!`)
        .setFooter('Rodger | 🔨 HAMMERTIME!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
      message.channel.send(embed);

    }
    catch (err) { console.log(err) }
  }
}
