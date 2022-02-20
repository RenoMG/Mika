const { MessageEmbed } = require("discord.js");
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');

module.exports = {
  name: "randomreddit",
  aliases: ["rr", "randomr", "redditpost"],
  category: "user",
  description: "Sends random reddit post from reddit of users choice.",
  run: async (client, message, args) => {

    try {

      if (args.length < 1)
        return message.reply("Please enter some text!")

      var redditpage = args.join(" ");
      var redditpagefix = redditpage.replace(/\s+/g, '');

      var counts = 21;

      var redditpagefix2 = redditpagefix.slice(0, counts);

      var options = [`https://www.reddit.com/r/${redditpagefix2}.json?sort=top&t=week`]

      var response = options[Math.floor(Math.random() * options.length)];


      const { body } = await snekfetch
        .get(response)
        .query({ limit: 800 });
      const allowed = message.channel.nsfw ? body.data.children : body.data.children.filter(post => !post.data.over_18);
      if (!allowed.length) return message.channel.send('Error! Are you sure you typed the reddit page correctly?');
      const randomnumber = Math.floor(Math.random() * allowed.length)

      var textdata = (allowed[randomnumber].data.selftext || `No text found on this post 😓`);

      var imagedata = (allowed[randomnumber].data.thumbnail || 'https://media1.tenor.com/images/d4c3815d77404921e89698fe19bca91c/tenor.gif?itemid=5760006');
      var res = imagedata.replace("self", "https://media1.tenor.com/images/d4c3815d77404921e89698fe19bca91c/tenor.gif?itemid=5760006");

      var count = 250;

      var textresult = textdata.slice(0, count) + (textdata.length > count ? "..." : " ");

      const embed = new MessageEmbed()
        .setColor("RANDOM")
        .setTitle("RR | " + allowed[randomnumber].data.title)
        .setURL(`https://www.reddit.com${allowed[randomnumber].data.permalink}`)
        .setDescription("Posted by: " + allowed[randomnumber].data.author)
        .addField('‏‏‎ ‎', `Text: \n${textresult}`, false)
        .addField('‏‏‎ ‎‎‎', `Image:`, false)
        .setImage(`${res}`)
        .setTimestamp()
        .setFooter("Rodger | 🔮 Random Reddit ~ 👍: " + allowed[randomnumber].data.ups + " | 💬: " + allowed[randomnumber].data.num_comments, "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
      message.channel.send(embed)
    } catch (err) {
      return console.log(err);
    }

  }
}
