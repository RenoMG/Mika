const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");

module.exports = {
  name: "np",
  aliases: [],
  category: "music",
  description: "Now playing",
  usage: "<args>",
  run: async (client, message) => {
    var list = message.client.queue.get(message.guild.id);
    const channel = message.member.voice.channel;
    if (!channel)
      return message.channel.send(
        "You must Join a voice channel before using this command!"
      );
    let queue = message.client.queue.get(message.guild.id);
    if (!queue)
      return message.channel.send(
        new MessageEmbed()
          .setColor("RED")
          .setDescription(":x: There are no songs playing in this server")
      );
    message.channel.send(
      new MessageEmbed()
        .setAuthor("Now Playing")
        .setColor("GREEN")
        .addField(`**~** Song info`,
          stripIndents`
  • Name: ${queue.queue[0].name}
  • Duration: ${queue.queue[0].duration}
  • Requested By: ${queue.queue[0].requested}
  • Queue: ${list.queue.length}
  `, false)
        .setThumbnail(queue.queue[0].thumbnail)
        .setFooter("Rodger | 🎶 Music", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
    );
  }
};
