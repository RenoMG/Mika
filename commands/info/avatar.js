const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");

module.exports = {
  name: "avatar",
  aliases: ["avi", "pfp", "portrait"],
  category: "info",
  description: "Gets user avatar.",
  usage: "[username | id, | mention]",
  run: async (client, message, args) => {

    const member = getMember(message, args.join(" "));

    //Member variables
    const joined = formatDate(member.joinedAt);
    const roles = member.roles.cache
      .filter(r => r.id !== message.guild.id)
      .map(r => r)
      .join(", ") || "none";

    if (!args[0]) {
      const embed1 = new MessageEmbed()
        .setImage(member.user.displayAvatarURL())
        .setColor(member.displayHexColor)
        .setDescription(`**Here is your pfp ${member}.**`, false)
        .setTimestamp()
        .setFooter('Rodger | 🐹 AVATAR!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
      return message.channel.send(embed1);
    };



    const embed2 = new MessageEmbed()
      .setImage(member.user.displayAvatarURL())
      .setColor(member.displayHexColor)
      .setDescription(`**Here is the pfp of ${member}.**`, false)
      .setTimestamp()
      .setFooter('Rodger | 🐹 AVATAR!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");

    message.channel.send(embed2);
  }

}
