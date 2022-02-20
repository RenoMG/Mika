const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "kill",
  category: "user",
  description: "kills mentioned user.",
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

    var options = ['https://media.tenor.com/images/9a67b536e0272b32fc95d07fefd47a0e/tenor.gif',
      'https://media.tenor.com/images/7b05ec0da769abc432f6a0ef2498f163/tenor.gif',
      'https://media.tenor.com/images/c6aab5d9fa8998c15a29712a083c170e/tenor.gif',
      'https://media.tenor.com/images/e9927ee6346f32fb8df4a59823f27d12/tenor.gif',
      'https://media.tenor.com/images/69efbd65d3e9469a2187c4e325d36bc8/tenor.gif',
      'https://media.tenor.com/images/2a58c96f6216856ecd38037e3131d832/tenor.gif',
      'https://media.tenor.com/images/62d1738ecd9ed322f7d143498b96a920/tenor.gif',
      'https://media.tenor.com/images/3740f5dbf6f7f0eaf4e8577e2d85160f/tenor.gif',
      'https://media.tenor.com/images/d10e60dba8ba6652e654bbd41efc50e1/tenor.gif',
      'https://media.tenor.com/images/5727ffc94ecdc95f1d3d79be986174a8/tenor.gif',
      'https://media.tenor.com/images/b44ddca43c8e80f914e3c4c52809b99b/tenor.gif',
      'https://media.tenor.com/images/fd0a4f03805e131d8553117451a3d2d9/tenor.gif',
      'https://media.tenor.com/images/deb3fb1bfa6d4df7941c6e6efcd2f763/tenor.gif',
      'https://media.tenor.com/images/62a33f3d1d310c6a5d8d4e346261960a/tenor.gif',
      'https://media.tenor.com/images/58b4878b12fca144295db7e2d170ca13/tenor.gif',
      'https://media.tenor.com/images/107afe954a14ebf07a03e00209eed085/tenor.gif',
      'https://media.tenor.com/images/f2b5e4cad1fa2eec992c7bad99472cbf/tenor.gif'];

    var response = options[Math.floor(Math.random() * options.length)];

    var sayings = ["! NOOO!",
      "! 😲",
      "! That's horrible!",
      "",
      "! WHY?!",
      "! I'm calling the police!",
      "! 🔪",
      "! OK, What is going on!"];

    var sayingsdat = sayings[Math.floor(Math.random() * sayings.length)];

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} kills ${member}${sayingsdat}**`)
      .setFooter('Rodger | 💣 KILL!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
