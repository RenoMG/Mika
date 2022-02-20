const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "boop",
  category: "user",
  aliases: ["poke", "nose"],
  description: "Boops mentioned user.",
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

    var options = ['https://media1.tenor.com/images/95300f56dab4593a3fd3b7565be2bdaf/tenor.gif?itemid=14216702',
      'https://media1.tenor.com/images/7abde695bf76df9a228a2e879250f492/tenor.gif?itemid=11515298',
      'https://media1.tenor.com/images/1f3eb454a452c891571e614ae1235ded/tenor.gif?itemid=12683903',
      'https://media1.tenor.com/images/b0371d969b7f722af7477900e9ec8519/tenor.gif?itemid=5657845',
      'https://media1.tenor.com/images/1f7c2d7bc8587e9ec4422a8d1af73f82/tenor.gif?itemid=7479077',
      'https://media1.tenor.com/images/cc6d3dfe2608fe8814aad379c398b93c/tenor.gif?itemid=7296714',
      'https://media1.tenor.com/images/ea37d5c281b7ca7c35175bdc854b0a5b/tenor.gif?itemid=11159084',
      'https://media1.tenor.com/images/4f4625cbf06aaf46a8874109f746367d/tenor.gif?itemid=14409929',
      'https://media1.tenor.com/images/fdeab78781aad1490c3e1842008eedba/tenor.gif?itemid=5754722',
      'https://media1.tenor.com/images/4dc6c461cf0cacf8e7a6b4ace3f6813e/tenor.gif?itemid=5550498',
      'https://media1.tenor.com/images/a0f0c6b3ef95bb2ff530a92d6c516cbd/tenor.gif?itemid=14452125',
      'https://media1.tenor.com/images/a53e293e863d60d218d35e5055c772fe/tenor.gif?itemid=13875262',
      'https://media1.tenor.com/images/1261400942827913e0da6d55e0c3bc3f/tenor.gif?itemid=12066576',
      'https://media1.tenor.com/images/a5f20fd1ffafe3ecdc6c43506974a7e3/tenor.gif?itemid=5375919'];

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
      .setDescription(`**${message.author} boops ${member}${sayingsdat}**`)
      .setFooter('Rodger | 👃 BOOP!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
