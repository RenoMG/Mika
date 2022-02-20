const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "blush",
  category: "user",
  description: "User blushes",
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

    var options = ['https://media.tenor.com/images/4e6f9240e4c059eb88413b9c7a4bd0fb/tenor.gif',
      'https://media.tenor.com/images/29f005a6ff53ce17e4d54953ad38eaf2/tenor.gif',
      'https://media.tenor.com/images/8a4aa524f5241e7f7484d0296e71e49d/tenor.gif',
      'https://media.tenor.com/images/ca0a2a8ed44d96a87df375a53a16c920/tenor.gif',
      'https://media.tenor.com/images/943ce9cd29a80f7d230e51b5deb50fd9/tenor.gif',
      'https://media.tenor.com/images/2b3cfc55cd2647d78acea3d418fc4a10/tenor.gif',
      'https://media.tenor.com/images/8305020f89ab43ab16b798bed181ec90/tenor.gif',
      'https://media.tenor.com/images/5536866f9fb46611b69df33f2fd7fc84/tenor.gif',
      'https://media.tenor.com/images/679005541cbd16d3aeadfd746e1bde73/tenor.gif',
      'https://media.tenor.com/images/f24f8933443794a56e2b43c31427a175/tenor.gif',
      'https://media.tenor.com/images/b4be3af320d6bff5196e627f9964c38d/tenor.gif',
      'https://media.tenor.com/images/a426e322fc671776f40b148b7aed757a/tenor.gif',
      'https://media.tenor.com/images/352a09c647d6d7df4f05a230817e3183/tenor.gif',
      'https://media.tenor.com/images/b64adf14c39530eca66302b8d884a743/tenor.gif',
      'https://media.tenor.com/images/268f26ea45e3d74e41ac1e40c85589d5/tenor.gif',
      'https://media.tenor.com/images/c01210f9ff47b55788e854446260e857/tenor.gif',
      'https://media.tenor.com/images/4fedb5d353d36e31535894fb8f49b55b/tenor.gif',
      'https://media.tenor.com/images/d42302c5506c6b8d0e9e3d7c317a4aae/tenor.gif',
      'https://media.tenor.com/images/b45466d5a6b9937e90d6dc27aec50029/tenor.gif',
      'https://media.tenor.com/images/a921c7475e7075087743b2e0ad4619a3/tenor.gif'];

    var response = options[Math.floor(Math.random() * options.length)];

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} blushes.**`)
      .setFooter('Rodger | 😳 BLUSH!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
