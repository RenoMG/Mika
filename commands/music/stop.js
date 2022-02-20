const { MessageEmbed } = require("discord.js");

module.exports = {
  name: "stop",
  aliases: [],
  category: "music",
  description: "Stop music",
  usage: "<args>",
  run: async (client, message) => {
    const channel = message.member.voice.channel;
    if (!channel)
      return message.channel.send(
        "You must Join a voice channel before using this command!"
      );
    let queue = message.client.queue.get(message.guild.id);
    if (!queue)
      return message.channel.send(
        new MessageEmbed()
          .setDescription("There are no songs playing in this server")
          .setColor("RED")
          .setFooter("Rodger | 🎶 Music", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
      );
    queue.connection.dispatcher.end();
    queue.queue = [];
    return message.channel.send(
      new MessageEmbed()
        .setDescription("**Music stopped!**")
        .setColor("GREEN")
        .setFooter("Rodger | 🎶 Music", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
    );
  }
};
