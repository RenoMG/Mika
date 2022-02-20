const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");

module.exports = {
  name: "uinfo",
  aliases: ["userinfo", "who", "whois"],
  category: "info",
  description: "Gets info on user.",
  usage: "[username | id, | mention]",
  run: async (client, message, args) => {

    const member = getMember(message, args.join(" "));

    //Member variables
    const joined = formatDate(member.joinedAt);
    const roles = member.roles
      .cache.filter(r => r.id !== message.guild.id)
      .map(r => r)
      .join(", ") || "none";

    //User variables
    const created = formatDate(member.user.createdAt);

    const embed = new MessageEmbed()
      .setFooter(member.displayName, member.user.displayAvatarURL())
      .setThumbnail(member.user.displayAvatarURL)
      .setColor(member.displayHexColor)
      .setTitle("USER INFO")
      .addField('**~** Server information', stripIndents`• Display name: ${member.displayName}
            • Joined: ${joined}
            • Roles: ${roles}`, false)

      .addField('**~** Account information', stripIndents`• ID: ${member.user.id}
            • Username: ${member.user.username}
            • Discord Tag: ${member.user.tag}
            • Created at: ${created}`, false)

      .setTimestamp()
      .setFooter("Rodger | 🔎 User info", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")

    if (member.user.presence.game)
      embed.addField('**~ Currently playing**', `• Name: ${member.user.presence.game.name}`);

    message.channel.send(embed);
  }

}
