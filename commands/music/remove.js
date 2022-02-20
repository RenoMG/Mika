const { MessageEmbed } = require("discord.js");
const Keyv = require('keyv');

const globalPrefix = '.';
const prefixes = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setprefix' });

module.exports = {
  name: "remove",
  aliases: [],
  category: "music",
  description: "Remove music",
  usage: "<args>",
  run: async (client, message, args) => {
    const channel = message.member.voice.channel;
    if (!channel)
      return message.channel.send(
        "You must Join a voice channel before using this command!"
      );
    if (!args[0])
      return message.channel.send(
        new MessageEmbed()
          .setDescription("Please input what song number!")
          .setColor("RED")
      );
    if (isNaN(args[0]))
      return message.channel.send(
        new MessageEmbed()
          .setDescription("Please enter a number only!")
          .setColor("RED")
      );
    let queue = message.client.queue.get(message.guild.id);
    if (args[0] == 1)
      return message.channel.send(
        new MessageEmbed()
          .setDescription(`Use \`${await prefixes.get(message.guild.id) || globalPrefix}\`skip to remove the song.`)
          .setColor("RED")
      );
    if (queue.queue.length == 1)
      return message.channel.send(
        new MessageEmbed()
          .setDescription(`Use \`${await prefixes.get(message.guild.id) || globalPrefix}\`stop to remove the song.`)
          .setColor("RED")
      );
    if (args[0] > queue.queue.length)
      return message.channel.send(
        new MessageEmbed()
          .setDescription("Queue is empty.")
          .setColor("RED")
      );
    if (!queue)
      return message.channel.send(
        new MessageEmbed()
          .setDescription("Queue is empty.")
          .setColor("RED")
      );
    var name = queue.queue[args[0] - 1].name;
    queue.queue.splice(args[0] - 1);
    return message.channel.send(
      new MessageEmbed()
        .setDescription("**Removed" + " " + name + " " + "from queue.**")
        .setTimestamp()
        .setColor("GREEN")
        .setFooter("Rodger | 🎶 Music", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
    );
  }
};
