const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "slap",
  category: "user",
  description: "Slaps mentioned user.",
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

    var options = ['https://media1.tenor.com/images/bc858e69d5022807b84554b2d4583c10/tenor.gif?itemid=5122019',
      'https://media1.tenor.com/images/6a288821409733bb848f14b9443f8b73/tenor.gif?itemid=4079563',
      'https://media1.tenor.com/images/204dc002cab486541636f163a73c796f/tenor.gif?itemid=10570690',
      'https://media1.tenor.com/images/6aa432caad8e3272d21a68ead3629853/tenor.gif?itemid=4474446',
      'https://media1.tenor.com/images/49796f431821592cafbdd97092347a00/tenor.gif?itemid=4207778',
      'https://media1.tenor.com/images/0861f08d774be11c986629109c380a80/tenor.gif?itemid=11458265',
      'https://media1.tenor.com/images/e7a1b07f02a2cbed51494b421e0b561f/tenor.gif?itemid=10742154',
      'https://media1.tenor.com/images/4e113115b899d18f4a12f78a1557a1a2/tenor.gif?itemid=15051103',
      'https://media1.tenor.com/images/b402a8e048dc9b092afaf886695b8d44/tenor.gif?itemid=14667643',
      'https://media1.tenor.com/images/122fe52d4163b1c6d8ad2a00291ded86/tenor.gif?itemid=15652982',
      'https://media1.tenor.com/images/14dc65890bf0cf98ac6fcd41f13f80b4/tenor.gif?itemid=14231834',
      'https://media1.tenor.com/images/07829329a0581cdc77a8656b2cdbefbb/tenor.gif?itemid=15734086',
      'https://media1.tenor.com/images/99ed477325a30d045b69170080e14e53/tenor.gif?itemid=15697214',
      'https://media1.tenor.com/images/6e91abdfc6cbd901e5b57331977c5e69/tenor.gif?itemid=15960658',
      'https://media1.tenor.com/images/555b9d6a60c6a24210696bcc5fab8a91/tenor.gif?itemid=15917737',
      'https://media1.tenor.com/images/d68d5178ff2e372369ffefd8e1c0bac8/tenor.gif?itemid=16158933',
      'https://media1.tenor.com/images/e685653e586d60991d640dc70559bbe9/tenor.gif?itemid=7075881',
      'https://media1.tenor.com/images/7a2734bddb5e3f179195771c5cc48885/tenor.gif?itemid=16081425',
      'https://media1.tenor.com/images/ff95aafec18f12777c59ec604a12edfa/tenor.gif?itemid=16108079'];

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
      .setDescription(`**${message.author} slaps ${member}! ${sayingsdat}**`)
      .setFooter('Rodger | ✋ SLAP!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
