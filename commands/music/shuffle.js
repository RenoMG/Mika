const { MessageEmbed } = require("discord.js");

module.exports = {
  name: "shuffle",
  aliases: [],
  category: "music",
  description: "Shuffle music",
  usage: "<args>",
  run: async (client, message) => {
    const channel = message.member.voice.channel;
    if (!channel)
      return message.channel.send(
        "You must Join a voice channel before using this command!"
      );
    const queue = message.client.queue.get(message.guild.id);
    if (!queue)
      return message.channel.send(
        new MessageEmbed()
          .setAuthor("Shuffler")
          .setDescription("**There are no songs in queue to shuffle**")
          .setColor("RED")
          .setFooter("Rodger | 🎶 Music", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
      );
    let songs = queue.queue;
    for (let i = songs.length - 1; i > 1; i--) {
      let j = 1 + Math.floor(Math.random() * i);
      [songs[i], songs[j]] = [songs[j], songs[i]];
    }
    queue.queue = songs;
    message.client.queue.set(message.guild.id, queue);
    message.channel
      .send(
        new MessageEmbed()
          .setAuthor("Shuffler")
          .setDescription("**Shuffled the queue**")
          .setColor("GREEN")
          .setFooter("Rodger | 🎶 Music", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
      )
      .catch(console.error);
  }
};
