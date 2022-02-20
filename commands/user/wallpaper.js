const { MessageEmbed } = require("discord.js");
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');

module.exports = {
  name: "wallpaper",
  category: "user",
  description: "Sends random wallpaper image",
  run: async (client, message, args) => {

    try {

      var options = ['https://www.reddit.com/r/wallpaper.json?sort=top&t=week',
        'https://www.reddit.com/r/wallpapers.json?sort=top&t=week',
        'https://www.reddit.com/r/iphonewallpapers.json?sort=top&t=week',
        'https://www.reddit.com/r/MinimalWallpaper.json?sort=top&t=week',
        'https://www.reddit.com/r/Verticalwallpapers.json?sort=top&t=week']

      var response = options[Math.floor(Math.random() * options.length)];

      const { body } = await snekfetch
        .get(response)
        .query({ limit: 800 });
      const allowed = message.channel.nsfw ? body.data.children : body.data.children.filter(post => !post.data.over_18);
      if (!allowed.length) return message.channel.send('All out of images... Try again later!');
      const randomnumber = Math.floor(Math.random() * allowed.length)
      const embed = new MessageEmbed()
        .setColor("RANDOM")
        .setTitle("WALLPAPER | " + allowed[randomnumber].data.title)
        .setURL(allowed[randomnumber].data.url)
        .setDescription("Posted by: " + allowed[randomnumber].data.author)
        .setImage(allowed[randomnumber].data.url)
        .setTimestamp()
        .setFooter("Rodger | 🌆 Random wallpaper ~ 👍: " + allowed[randomnumber].data.ups + " | 💬: " + allowed[randomnumber].data.num_comments, "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
      message.channel.send(embed)
    } catch (err) {
      return console.log(err);
    }

  }
}
