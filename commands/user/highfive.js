const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "highfive",
  category: "user",
  aliases: ["hf", "5"],
  description: "high fives mentioned user.",
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

    var options = ['https://media1.tenor.com/images/8444e2053a9f86b1fcab5181809b0b55/tenor.gif?itemid=5150392',
      'https://media1.tenor.com/images/eef1cc603f4079dd443a14c8be1a5ef2/tenor.gif?itemid=6002654',
      'https://media1.tenor.com/images/91f1a31ba9edbbacd9243aa2e8ab1d7b/tenor.gif?itemid=3551518',
      'https://media1.tenor.com/images/b5165d9855f1147c6e19d6367ee9a972/tenor.gif?itemid=4874001',
      'https://media1.tenor.com/images/bd8c47a9cddeac245926b1c51bb31e55/tenor.gif?itemid=7888580',
      'https://media1.tenor.com/images/30e54ca4c651f1a376519736d112c50f/tenor.gif?itemid=3463569',
      'https://media1.tenor.com/images/64a388854af0eddc785aa96d422354ed/tenor.gif?itemid=3572729',
      'https://media1.tenor.com/images/66c229a0a5a852a841c4181bc4a79543/tenor.gif?itemid=7572343',
      'https://media1.tenor.com/images/81690b56e4935f929a0b3d68ec6b279a/tenor.gif?itemid=7887388',
      'https://media1.tenor.com/images/0e98fe3a950d2ffbf2a28d1300ec2427/tenor.gif?itemid=13098272',
      'https://media1.tenor.com/images/9dcb69fbe7eb8bacbeab227a18d27d61/tenor.gif?itemid=11848536',
      'https://media1.tenor.com/images/fcb4428db0cc6e7fb740d5799ca1bc82/tenor.gif?itemid=9817538'];

    var response = options[Math.floor(Math.random() * options.length)];

    var sayings = ["High fives themselves?"];

    var sayingsdat1 = sayings[Math.floor(Math.random() * sayings.length)];

    var sayings2 = [", ",
      ", 😄",
      ", Yea boi!",
      "",
      ", Wooooo!",
      ", REEEEE!",
      ", ✋",
      ", UP TOP!"];

    var sayingsdat2 = sayings2[Math.floor(Math.random() * sayings2.length)];

    if (!args[0]) {
      const embed = new MessageEmbed()
        .setColor("RANDOM")
        .setImage(response)
        .setURL(response)
        .setTimestamp()
        .setDescription(`**${message.author}, ${sayingsdat1}**`)
        .setFooter('Rodger | ✋ HIGH FIVE!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
      return message.channel.send(embed);
    };

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} high fives ${member}${sayingsdat2}**`)
      .setFooter('Rodger | ✋ HIGH FIVE!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
