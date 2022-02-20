const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "cuddle",
  category: "user",
  description: "Cuddles mentioned user.",
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

    var options = ['https://media1.tenor.com/images/4b4e31cf76c98ac6baa3bf6b4e3f3089/tenor.gif?itemid=7534078',
      'https://media1.tenor.com/images/f70f267287f7a0b0a029ef979d569742/tenor.gif?itemid=11453480',
      'https://media1.tenor.com/images/fd40fe3e4d96c53efc3a6fa8c4a151a5/tenor.gif?itemid=5637792',
      'https://media1.tenor.com/images/e1035f7a2efb7722abd665f4e6a164be/tenor.gif?itemid=16022685',
      'https://media1.tenor.com/images/0aced4890b86b4f78206dd7fa16dc198/tenor.gif?itemid=5404693',
      'https://media1.tenor.com/images/2259bbd5696244422b64fc4c7d235a93/tenor.gif?itemid=13765442',
      'https://media1.tenor.com/images/338af93f5179890c5aebe38d2d083ad8/tenor.gif?itemid=9196735',
      'https://media1.tenor.com/images/7e28f0d65aca8ac679f5891681359dd7/tenor.gif?itemid=7583426',
      'https://media1.tenor.com/images/e83b9a8f6006f89c803b489f19f4d73e/tenor.gif?itemid=5853731',
      'https://media1.tenor.com/images/2594ce9d465dca13a066c7ff8d94fa35/tenor.gif?itemid=15813355',
      'https://media1.tenor.com/images/d0ce35908e52f3eee132b0c534ff97fa/tenor.gif?itemid=15821424',
      'https://media1.tenor.com/images/ec9ed798f1955a01dbde4a60165b6587/tenor.gif?itemid=8123182'];

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
      .setDescription(`**${message.author} cuddles ${member}${sayingsdat}**`)
      .setFooter('Rodger | 💑 CUDDLE!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
