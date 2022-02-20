const {
  MessageEmbed
} = require("discord.js");

module.exports = {
  name: "alive",
  category: "info",
  aliases: ["ping", "latency"],
  description: "Returns latency and API ping.",
  run: async (client, message, args) => {

    const msg = await message.channel.send(`Checking...`);

    const embed2 = new MessageEmbed()
      .setTitle("PING")
      .setColor("RANDOM")
      .addField('**~** Latency', `${Math.floor(msg.createdAt - message.createdAt)}ms`, false)
      .setFooter("Rodger | 📡 Ping", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
      .setTimestamp()

    msg.edit(embed2)
  }
}