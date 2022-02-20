const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "punch",
  category: "user",
  aliases: ["hit", "ko"],
  description: "Punches mentioned user.",
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

    var options = ['https://media1.tenor.com/images/4a8d946147849328033e4a333f2827a3/tenor.gif?itemid=5579775',
      'https://media1.tenor.com/images/0422c84416d4ee4466f56936a1a12b10/tenor.gif?itemid=13627939',
      'https://media1.tenor.com/images/9172a834ca70e5ba5e4ac3e1ad7220cf/tenor.gif?itemid=7762551',
      'https://media1.tenor.com/images/4164decf9ab967f41aa946a97678a539/tenor.gif?itemid=7559294',
      'https://media1.tenor.com/images/13fe9a351036af51d6c19afa124b89eb/tenor.gif?itemid=4448414',
      'https://media1.tenor.com/images/6ae6f1ae460a9714e114607b3ddd06fb/tenor.gif?itemid=13759112',
      'https://media1.tenor.com/images/478ae894e3058a42242cbe177cd9cdf0/tenor.gif?itemid=14279695',
      'https://media1.tenor.com/images/01dba2a7ae4584a147fc4fb35bf556b3/tenor.gif?itemid=12851544',
      'https://media1.tenor.com/images/9bba742be4d7425ed8c02eaa9712e72b/tenor.gif?itemid=11032509',
      'https://media1.tenor.com/images/13b25dae30be2d28edbd1dce4ec64fac/tenor.gif?itemid=14162290',
      'https://media1.tenor.com/images/92c98c77a5093187b09bec6e6331f883/tenor.gif?itemid=15221181',
      'https://media1.tenor.com/images/b1c3eeabc822d7d6d0fba2b7b2b69d01/tenor.gif?itemid=12060927',
      'https://media1.tenor.com/images/d38d91964181c19afbdcb161dd703948/tenor.gif?itemid=12197090',
      'https://media1.tenor.com/images/df8af24e5756ecf4a4e8af0c9ea6499b/tenor.gif?itemid=4902917',
      'https://media1.tenor.com/images/a266cf7a81aedb8875f4c9dda87b8244/tenor.gif?itemid=10521040',
      'https://media1.tenor.com/images/3cb63fc4a0a1e1ace4738e3563c0064c/tenor.gif?itemid=12542726',
      'https://media1.tenor.com/images/16d39b60004cc880deac9b1ab53833f7/tenor.gif?itemid=15802615',
      'https://media1.tenor.com/images/35be2b2ee3b9984622101b9951b88dfe/tenor.gif?itemid=15401036',
      'https://media1.tenor.com/images/39ba2817ce510485633261c2ee5b486b/tenor.gif?itemid=12356509',
      'https://media1.tenor.com/images/cc55983d783e7658af186b6a6ac345c9/tenor.gif?itemid=3525890',
      'https://media1.tenor.com/images/5c5bb71f582caf3b6469485a6c9a0583/tenor.gif?itemid=16107016',
      'https://media1.tenor.com/images/efec16d70117d905f0bbf5ffdbae1cd0/tenor.gif?itemid=16185362'];

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

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} punches ${member}! ${sayingsdat}**`)
      .setFooter('Rodger | 👊 PUNCH!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
