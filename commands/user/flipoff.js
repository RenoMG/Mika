const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "flipoff",
  aliases: ["fu", "fuckyou", "fackyou", "fuck", "fuckoff"],
  category: "user",
  description: "Flips off mentioned user.",
  run: async (client, message, args, user) => {

    const member = getMember(message, args.join(" "));

    // Member variables
    const joined = formatDate(member.joinedAt);
    const roles = member.roles
      .cache.filter(r => r.id !== message.guild.id)
      .map(r => r)
      .join(", ") || "none";

    // User variables
    const created = formatDate(member.user.createdAt);

    var options = ['https://media1.tenor.com/images/47824bcda90cb52fd6cfe7e37cc028c0/tenor.gif?itemid=10224652',
      'https://media1.tenor.com/images/c39f88803e859deb844be6b94017dbe0/tenor.gif?itemid=10224649',
      'https://media1.tenor.com/images/ee6147b2d68db8ddcee6041362d522cb/tenor.gif?itemid=10224653',
      'https://media1.tenor.com/images/609b6fc2b9278fc145d351dd112d0a9c/tenor.gif?itemid=10174031',
      'https://media1.tenor.com/images/045f0f303c2c4ac557b2733f0e7c31d3/tenor.gif?itemid=5288508',
      'https://media1.tenor.com/images/15bef7f746cfa8b8271ebb8c7c8fa03f/tenor.gif?itemid=3797474',
      'https://media1.tenor.com/images/c2ecaa2ec01f6dba9bbbb1d0b4ea785c/tenor.gif?itemid=5453953',
      'https://media1.tenor.com/images/47c70a1f0979d707adeb1e34b6172686/tenor.gif?itemid=4673187',
      'https://media1.tenor.com/images/8cc82a41f48167f1333fd9c35d453c81/tenor.gif?itemid=4672131',
      'https://media1.tenor.com/images/89ba0bc52fb2c35c23f5322118c5fdda/tenor.gif?itemid=10759402',
      'https://media1.tenor.com/images/d9299f7115d60474dd021f38dfd64af8/tenor.gif?itemid=11414755',
      'https://media1.tenor.com/images/2916e7b4c674f2447c3eda1f08964578/tenor.gif?itemid=5099717',
      'https://media1.tenor.com/images/689b7040befa16ce97f1de0f288db0c4/tenor.gif?itemid=15827036',
      'https://media1.tenor.com/images/1536a65f8b15c2a449272aeb20671405/tenor.gif?itemid=16214878',
      'https://media1.tenor.com/images/4e0970ce69971022734e71738d824f5f/tenor.gif?itemid=15409219',
      'https://media1.tenor.com/images/a84e3273c6355a99d69026b9bdc2869f/tenor.gif?itemid=15700337',
      'https://media1.tenor.com/images/8aa777fef4a06f192b45433d9e9e1312/tenor.gif?itemid=16168367',
      'https://media1.tenor.com/images/f055ab3a99a5d2731112a06b286fb66c/tenor.gif?itemid=15684706',
      'https://media1.tenor.com/images/54f65cfaada3c9cd8c33828513ff6af1/tenor.gif?itemid=5139647'];

    var response = options[Math.floor(Math.random() * options.length)];

    var sayings = ["Oof",
      "Lol",
      "They had it coming!",
      "",
      "HA!",
      "Mean!!",
      "Oh thats cold.",
      "😂"];

    var sayingsdat = sayings[Math.floor(Math.random() * sayings.length)];

    //  message.channel.send(`${message.author} JUST DABBED ON ${member} `);

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} flips off ${member}! ${sayingsdat}**`)
      .setFooter('Rodger | 🖕 FLIP OFF!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
