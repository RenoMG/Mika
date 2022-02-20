const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");

module.exports = {
  name: "vote",
  category: "info",
  description: "Vote for Rodger.",
  run: async (client, message, args) => {

    const member = getMember(message, args.join(" "));

    const embed = new MessageEmbed()
      .setColor(member.displayHexColor)
      .setTitle("VOTE")
      .addField('**Vote for me on top.gg!** ', `❤ ❤ [Vote!](https://top.gg/bot/664244372723728424/vote) ❤ ❤`, false)
      .setTimestamp()
      .setFooter("Rodger | 👍 Vote!", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")


    const msg = await message.channel.send(embed);
  }
}
