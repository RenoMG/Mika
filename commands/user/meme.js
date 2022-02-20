const { MessageEmbed } = require("discord.js");
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');
const fetch = require('node-fetch');

module.exports = {
  name: "meme",
  category: "user",
  description: "Sends random meme.",
  run: async (client, message, args) => {

    try {

      var options = ['https://www.reddit.com/user/scammerrevolts/m/rodger/top/.json?sort=top&t=day&limit=500']

      var response = options[Math.floor(Math.random() * options.length)];

      const { body } = await snekfetch
        .get(response)
        .query({ limit: 800 });
      const allowed = body.data.children.filter(post => post.data.preview)
      if (!allowed.length) return message.channel.send('All out of memes... Try again later!');
      const randomnumber = Math.floor(Math.random() * allowed.length)
      const embed = new MessageEmbed()
        .setColor("RANDOM")
        .setTitle("MEME | " + allowed[randomnumber].data.title)
        .setURL(allowed[randomnumber].data.url)
        .setDescription("Posted by: " + allowed[randomnumber].data.author)
        .setImage(allowed[randomnumber].data.url)
        .setTimestamp()
        .setFooter("Rodger | 😂 Random meme ~ 👍: " + allowed[randomnumber].data.ups + " | 💬: " + allowed[randomnumber].data.num_comments, "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
      message.channel.send(embed)
    } catch (err) {
      return console.log(err);
    }

  }
}
