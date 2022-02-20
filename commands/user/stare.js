const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "stare",
  category: "user",
  description: "User stares",
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

    var options = ['https://media.tenor.com/images/d1ae46518951c8f43fb0c13bee6e781f/tenor.gif',
      'https://media.tenor.com/images/2d26a8df268c0f781a0ac5d074952680/tenor.gif',
      'https://media.tenor.com/images/d3d360a243ace5f22a690f829b4f934f/tenor.gif',
      'https://media.tenor.com/images/d6c2f78be75331b83516a77bbcee916d/tenor.gif',
      'https://media.tenor.com/images/a87a35975f8219543739eb82eda8e290/tenor.gif',
      'https://media.tenor.com/images/fd01718662c9158933c16a6e328bcb6f/tenor.gif',
      'https://media.tenor.com/images/e75280af41a824e9b8d29ea11a43a399/tenor.gif',
      'https://media.tenor.com/images/a3f9605080b201c54a7f1da094459094/tenor.gif',
      'https://media.tenor.com/images/8264010d1b636f7106de54475691ea84/tenor.gif',
      'https://media.tenor.com/images/fb7d694a9952f13f8399abca62c744f4/tenor.gif',
      'https://media.tenor.com/images/4a3b268a6ea41b447df0848e4af2dc39/tenor.gif',
      'https://media.tenor.com/images/aebc96e8c1fe388d16e2c4dc6d9f9c3a/tenor.gif',
      'https://media.tenor.com/images/9ded206d68a4deaf44b64e1f0be44dc1/tenor.gif',
      'https://media.tenor.com/images/e3fe5b83330d7505ac6ce9e8d0ccc2a1/tenor.gif',
      'https://media.tenor.com/images/a01df54c033d090533f81b62b5f12106/tenor.gif',
      'https://media.tenor.com/images/9f31232b930edf119332b22d6653f4f5/tenor.gif',
      'https://media.tenor.com/images/b3573dbe2ef0d8dabcec0fc8ffa8154e/tenor.gif',
      'https://media.tenor.com/images/5f96bfb5a80bc16ee2f55b45538df5bc/tenor.gif',
      'https://media.tenor.com/images/4c5f1f25624ffd35e8c86325c2d109e6/tenor.gif',
      'https://media.tenor.com/images/bc321913b683c0d66a31d99a0e418ada/tenor.gif',
      'https://media.tenor.com/images/e34a1095a5b42c255073b9b0e954fc5d/tenor.gif',
      'https://media.tenor.com/images/46e5c9081c0ac61dbe751aff12b48b21/tenor.gif'];

    var response = options[Math.floor(Math.random() * options.length)];

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} stares.**`)
      .setFooter('Rodger | 😶 STARE!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
