const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "dab",
  category: "user",
  description: "Dabs on mentioned user.",
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

    var options = ['https://media1.tenor.com/images/a13b0377304f6d5ccb3e393528d7799f/tenor.gif?itemid=5661979',
      'https://media1.tenor.com/images/3be662d17dcdae3aa7891b949a8fbc1d/tenor.gif?itemid=5044603',
      'https://media1.tenor.com/images/4f0a48e9ca005beb43e9a1f23eba01b5/tenor.gif?itemid=11976669',
      'https://media1.tenor.com/images/757d1de1f3d03ae059d6fcf650b178dc/tenor.gif?itemid=8226660',
      'https://media1.tenor.com/images/058562637a5a10b22224967eee845b21/tenor.gif?itemid=10913292',
      'https://media1.tenor.com/images/1401f4c05b2e2787cfa5b0cd17538690/tenor.gif?itemid=9229974',
      'https://media1.tenor.com/images/6ffa13b8ce8e8d112a368ef688f6cc99/tenor.gif?itemid=15118193',
      'https://media1.tenor.com/images/995a7f5954f85ef43bd32fba9da292a0/tenor.gif?itemid=10107480',
      'https://media1.tenor.com/images/4635ee263fa1eb82770d875f3ae8d2ba/tenor.gif?itemid=13464286',
      'https://media1.tenor.com/images/aad47489a4597fbfb23d9da7f3ee6919/tenor.gif?itemid=5407707',
      'https://media1.tenor.com/images/9a1e93af9076620cde71b259accd1a04/tenor.gif?itemid=10027244',
      'https://media1.tenor.com/images/8d0a3ecfe494c6cebf30e4a8840c000c/tenor.gif?itemid=12629395',
      'https://media1.tenor.com/images/cb22bf6841776de64bececb7a78372bc/tenor.gif?itemid=5656335',
      'https://media1.tenor.com/images/82c12f09b13e36d5b7e93d8edc9a46ed/tenor.gif?itemid=8108584',
      'https://media1.tenor.com/images/20b965c738f8832b54ca2441fedba027/tenor.gif?itemid=10833320',
      'https://media1.tenor.com/images/e507b0b023b53aa6dc6fe33f17030811/tenor.gif?itemid=15546969',
      'https://media1.tenor.com/images/e7aba55f5552cfd7fe82d18b9a0443f3/tenor.gif?itemid=15729254',
      'https://media1.tenor.com/images/3d9c86a0152b496515fed3a8735000d2/tenor.gif?itemid=7699390'];

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
      .setDescription(`**${message.author} dabs on ${member}! ${sayingsdat}**`)
      .setFooter('Rodger | 😲 DAB!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
