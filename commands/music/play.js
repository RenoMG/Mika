const ytdl = require("discord-ytdl-core");
const youtubeScraper = require("yt-search");
const yt = require("ytdl-core");
const { MessageEmbed, Util } = require("discord.js");
const forHumans = require("../../forhumans.js");
const { stripIndents } = require("common-tags");

module.exports = {
  name: "play",
  aliases: [],
  category: "music",
  description: "Play music",
  usage: "<args>",
  run: async (client, message, args) => {
    const channel = message.member.voice.channel;

    const error = (err) => message.channel.send(err);
    const send = (content) => message.channel.send(content);
    const setqueue = (id, obj) => message.client.queue.set(id, obj);
    const deletequeue = (id) => message.client.queue.delete(id);
    var song;

    if (!channel) return error("Please join a voice channel to use this command!");

    if (!channel.permissionsFor(message.client.user).has("CONNECT"))
      return error("I don't have permission to join the voice channel.");

    if (!channel.permissionsFor(message.client.user).has("SPEAK"))
      return error("I don't have permission to speak in the voice channel.");

    const query = args.join(" ");

    if (!query) return error("Please provide a name or url!");

    if (query.includes("www.youtube.com")) {
      try {
        const ytdata = await yt.getBasicInfo(query);
        if (!ytdata) return error("404 not found.");
        song = {
          name: Util.escapeMarkdown(ytdata.videoDetails.title),
          thumbnail:
            ytdata.player_response.videoDetails.thumbnail.thumbnails[0].url,
          requested: message.author,
          videoId: ytdata.videoDetails.videoId,
          duration: forHumans(ytdata.videoDetails.lengthSeconds),
          url: ytdata.videoDetails.video_url,
          views: ytdata.videoDetails.viewCount,
        };
      } catch (e) {
        console.log(e);
        return error("Error occured.");
      }
    } else {
      try {
        const fetched = (await youtubeScraper(query)).videos;
        if (fetched.length === 0 || !fetched)
          return error("404 not found.");
        const data = fetched[0];
        song = {
          name: Util.escapeMarkdown(data.title),
          thumbnail: data.image,
          requested: message.author,
          videoId: data.videoId,
          duration: data.duration.toString(),
          url: data.url,
          views: data.views,
        };
      } catch (err) {
        console.log(err);
        return error("An error occured.");
      }
    }

    var list = message.client.queue.get(message.guild.id);


    if (list) {
      list.queue.push(song);
      return send(
        new MessageEmbed()
          .setAuthor("➕ Added to queue")
          .setColor("GREEN")
          .setThumbnail(song.thumbnail)
          .addField(`**~** Song info`,
            stripIndents`
      • Name: ${song.name}
      • Duration: ${song.duration}
      • Requested By: ${song.requested.tag}
      • Queue: ${list.queue.length}
      `, false)
          .setFooter("Rodger | 🎶 Music", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
      );
    }

    const structure = {
      channel: message.channel,
      vc: channel,
      volume: 85,
      playing: true,
      queue: [],
      connection: null,
    };

    setqueue(message.guild.id, structure);
    structure.queue.push(song);

    try {
      const join = await channel.join();
      structure.connection = join;
      play(structure.queue[0]);
    } catch (e) {
      console.log(e);
      deletequeue(message.guild.id);
      return error("I couldn't join the voice channel, please check my permissions.");
    }

    async function play(track) {
      try {
        const data = message.client.queue.get(message.guild.id);
        if (!track) {
          data.channel.send("No music is currently playing, leaving voice channel.");
          message.guild.me.voice.channel.leave();
          return deletequeue(message.guild.id);
        }
        data.connection.on("disconnect", () => deletequeue(message.guild.id));
        const source = await ytdl(track.url, {
          filter: "audioonly",
          quality: "highestaudio",
          highWaterMark: 1 << 25,
          opusEncoded: true,
        });
        const player = data.connection
          .play(source, { type: "opus" })
          .on("finish", () => {
            var removed = data.queue.shift();
            if (data.loop == true) {
              data.queue.push(removed)
            }
            play(data.queue[0]);
          });
        player.setVolumeLogarithmic(data.volume / 100);
        data.channel.send(
          new MessageEmbed()
            .setAuthor("➕ Started Playing")
            .setColor("GREEN")
            .setThumbnail(track.thumbnail)
            .addField(`**~** Song info`,
              stripIndents`
      • Name: ${track.name}
      • Duration: ${track.duration}
      • Requested By: ${track.requested}
      `, false)
            .setFooter("Rodger | 🎶 Music", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
        );
      } catch (e) {
        console.error(e);
      }
    }
  }
};
