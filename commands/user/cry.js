const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "cry",
  category: "user",
  description: "User cries",
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

    var options = ['https://media.tenor.com/images/869d6366d2de52edc440c729c2167385/tenor.gif',
      'https://media.tenor.com/images/e6d446c26a3685f0c748cfdb634e5b1a/tenor.gif',
      'https://media.tenor.com/images/cdcda2b1095e235371af36ae38f2fd82/tenor.gif',
      'https://media.tenor.com/images/663d64cb093223c7a8ccd03d2d7577c8/tenor.gif',
      'https://media.tenor.com/images/b89f8b2617c8ba1b3bb1bf2e0509df2d/tenor.gif',
      'https://media.tenor.com/images/04db8316e7f739bdb6edb90f93eb0ea0/tenor.gif',
      'https://media.tenor.com/images/47608365978d83956791a4b70a1cfdba/tenor.gif',
      'https://media.tenor.com/images/b958d257f5b1cca2838bb6011e7018c3/tenor.gif',
      'https://media.tenor.com/images/a69446dfccc697c2fd1cb248b29af695/tenor.gif',
      'https://media.tenor.com/images/dc694b233cbee1fcb5d25a845e6cac3b/tenor.gif',
      'https://media.tenor.com/images/a8328f4f68451e45e3af67577896c721/tenor.gif',
      'https://media.tenor.com/images/c20ed85fdfe2efe4165f8525108a31bb/tenor.gif',
      'https://media.tenor.com/images/7e1004ebf8f71e76967d865d7738f204/tenor.gif',
      'https://media.tenor.com/images/e7ea6e3f0f91afc620a50d7742bfd837/tenor.gif',
      'https://media.tenor.com/images/ecedeb6b2891029be7b0bfe5f7c1f278/tenor.gif',
      'https://media.tenor.com/images/a8a11e089395bd07447afb6d045abe45/tenor.gif',
      'https://media.tenor.com/images/bfdb8c4d9131fd5e6873500b3d84a4d1/tenor.gif',
      'https://media.tenor.com/images/82f9f48ed9c45962cb3232c6dc92c9c8/tenor.gif',
      'https://media.tenor.com/images/0c2adb5615220bdcf981259fac5db1dd/tenor.gif',
      'https://media.tenor.com/images/8107b59a959248f936881e1c1018c65f/tenor.gif',
      'https://media.tenor.com/images/6691c44f09f3bb91f2dcad2a90d1356c/tenor.gif',
      'https://media.tenor.com/images/c6808ce64fb4926f5f810e38c2f0c7f2/tenor.gif',
      'https://media.tenor.com/images/b9b256eafbd680434e11ce8a7a60467f/tenor.gif',
      'https://media.tenor.com/images/b19ca57040447f26e8246f7b537c06e4/tenor.gif',
      'https://media.tenor.com/images/eda88aaad47aaab5d861c19a03d73e27/tenor.gif',
      'https://media.tenor.com/images/c9fdb6e3ab914d5b195b11ebd99524d0/tenor.gif',
      'https://media.tenor.com/images/73b7d128041cc8dd1f179b484a5e6146/tenor.gif',
      'https://media.tenor.com/images/3e3424e412413bddef4a566ad5a0caf3/tenor.gif',
      'https://media.tenor.com/images/5bbae1539269f93cbb38d67fe9f7e3c8/tenor.gif',
      'https://media.tenor.com/images/7cba9943d6449423bd9da78929bf6337/tenor.gif',
      'https://media.tenor.com/images/02656e8252be15d626df7d91e2347b1d/tenor.gif',
      'https://media.tenor.com/images/770b3d9bbe63e5c8f98421875293a161/tenor.gif',
      'https://media.tenor.com/images/5fbea42f205b367e119e5d5125704a2d/tenor.gif',
      'https://media.tenor.com/images/afacddd73a58f41dd2dc12def906d807/tenor.gif'];

    var response = options[Math.floor(Math.random() * options.length)];

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} cries.**`)
      .setFooter('Rodger | 😢 CRY!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
