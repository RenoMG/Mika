const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");

module.exports = {
  name: "invite",
  category: "info",
  aliases: ["add"],
  description: "Invite Rodger.",
  run: async (client, message, args) => {

    const member = getMember(message, args.join(" "));

    const embed = new MessageEmbed()
      .setColor(member.displayHexColor)
      .setTitle("INVITE")
      .addField('**Here is my invite link!** ', `❤ ❤ [Add me!](https://discordapp.com/api/oauth2/authorize?client_id=664244372723728424&permissions=8&scope=bot) ❤ ❤`, false)
      .setTimestamp()
      .setFooter("Rodger | ➕ Invite!", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")


    const msg = await message.channel.send(embed);
  }
}
