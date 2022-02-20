const { MessageEmbed } = require("discord.js");

module.exports = {
  name: "queue",
  aliases: [],
  category: "music",
  description: "queue settings",
  usage: "<args>",
  run: async (client, message) => {
    const channel = message.member.voice.channel;
    if (!channel)
      return message.channel.send(
        "You must Join a voice channel before using this command!"
      );
    const queue = message.client.queue.get(message.guild.id);
    var status;
    var np;
    var count = 0;
    if (!queue) status = "Queue is empty.";
    else
      status = queue.queue
        .map((x) => {
          count += 1;
          return (
            `**${count}.** ` +
            x.name +
            " - Requested by " +
            `<@${x.requested.id}>`
          );
        })
        .join("\n");
    if (!queue) np = status;
    else np = queue.queue[0].name;
    if (queue) thumbnail = queue.queue[0].thumbnail;
    else thumbnail = message.guild.iconURL();
    message.channel.send(
      new MessageEmbed()
        .setAuthor("Music Queue")
        .setThumbnail(thumbnail)
        .setColor("GREEN")
        .addField("Now Playing", np, false)
        .addField("In Queue", status, false)
        .setFooter("Rodger | 🎶 Music", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
    );
  }
};
