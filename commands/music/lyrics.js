const { MessageEmbed } = require("discord.js");
const lyricsFinder = require("lyrics-finder");

module.exports = {
  name: "lyrics",
  aliases: [],
  category: "music",
  description: "See music lyrics",
  usage: "<args>",
  run: async (client, message, args) => {
    const queue = message.client.queue.get(message.guild.id);
    if (!queue)
      return message.channel
        .send("There is nothing playing.")
        .catch(console.error);

    let lyrics = null;

    try {
      lyrics = await lyricsFinder(queue.queue[0].name, "");
      if (!lyrics) lyrics = `No lyrics found for ${queue.queue[0].name}.`;
    } catch (error) {
      lyrics = `No lyrics found for ${queue.queue[0].name}.`;
    }

    let lyricsEmbed = new MessageEmbed()
      .setAuthor(
        `Lyrics - ${queue.queue[0].name}`)
      .setDescription(lyrics)
      .setColor("GREEN")
      .setFooter("Rodger | 🎶 Music", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")

    if (lyricsEmbed.description.length >= 2048)
      lyricsEmbed.description = `${lyricsEmbed.description.substr(0, 2045)}...`;
    return message.channel.send(lyricsEmbed).catch(console.error);
  }
};
