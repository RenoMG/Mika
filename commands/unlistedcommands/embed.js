const {
  MessageEmbed
} = require("discord.js");
const usedCommandRecently = new Set();

module.exports = {
  name: "embed",
  category: "unlistedcommands",
  description: "Embeds user text.",
  usage: "<input>",
  run: async (client, message, args) => {

    if (usedCommandRecently.has(message.author.id)) {
      message.reply("Command on cooldown! Please wait 2m.");
    } else {

      if (message.deletable) message.delete();

      if (args.length < 1)
        return message.reply("Please enter some text!")

      const roleColor = message.guild.me.displayHexColor;
      const custom = args.slice(0).join(" ");

      const embed = new MessageEmbed()
        .setColor(roleColor)
        .setDescription(args.slice(0).join(" "))

      message.channel.send(embed);

      usedCommandRecently.add(message.author.id);
      setTimeout(() => {
        usedCommandRecently.delete(message.author.id)
      }, 120000);
    }
  }
}