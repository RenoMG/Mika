const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "kiss",
  category: "user",
  description: "kisses mentioned user.",
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

    var options = ['https://media1.tenor.com/images/45e529c116a1758fd09bdb27e2172eca/tenor.gif?itemid=11674749',
      'https://media1.tenor.com/images/31362a548dc7574f80d01a42a637bc93/tenor.gif?itemid=13985240',
      'https://media1.tenor.com/images/104b52a3be76b0e032a55df0740c0d3b/tenor.gif?itemid=10194764',
      'https://media1.tenor.com/images/0df97f6253419235268ca1a2efdb8e6a/tenor.gif?itemid=5702977',
      'https://media1.tenor.com/images/de0865f5f7d25b8fb5659d84417e4931/tenor.gif?itemid=4930702',
      'https://media1.tenor.com/images/fb92d0be78a1ea19af0168c0ca29c1bd/tenor.gif?itemid=5615952',
      'https://media1.tenor.com/images/f94949eab0905710b4f2ea4666631c2c/tenor.gif?itemid=3975338',
      'https://media1.tenor.com/images/a66f4ac0deded0a2a12260cb1af11c3c/tenor.gif?itemid=11034277',
      'https://media1.tenor.com/images/90b75f6ec58f0c1a7dc8406dd2b1f249/tenor.gif?itemid=7754017',
      'https://media1.tenor.com/images/86b2783ea71f013f4c2dabc1e0cb6574/tenor.gif?itemid=4531955'];

    var response = options[Math.floor(Math.random() * options.length)];

    var sayings = [", aww.",
      ", 😳",
      ", Now that's cute.",
      "",
      ", adorable!",
      ", so sweet!",
      ", 💓",
      ", now just look at that!"];

    var sayingsdat = sayings[Math.floor(Math.random() * sayings.length)];

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} kisses ${member}${sayingsdat}**`)
      .setFooter('Rodger | 💋 KISS!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
