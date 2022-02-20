const randomPuppy = require("random-puppy");
const { emojiSend } = require("../../functions.js");

module.exports = {
  name: "8ball",
  category: "user",
  description: "Ask 8ball a question.",
  run: async (client, message, args) => {

    var responses = [`As I see it, yes.`,
      `Ask again later.`,
      `Better not tell you now.`,
      `Cannot predict now.`,
      `Concentrate and ask again.`,
      `Don’t count on it.`,
      `It is certain.`,
      `It is decidedly so.`,
      `Most likely.`,
      `My reply is no.`,
      `My sources say no.`,
      `Outlook not so good.`,
      `Outlook good.`,
      `Reply hazy, try again.`,
      `Signs point to yes.`,
      `Very doubtful.`,
      `Without a doubt.`,
      `Yes.`,
      `Yes – definitely.`,
      `You may rely on it.`];

    var response = responses[Math.floor(Math.random() * responses.length)];

    if (!args[0]) {
      return message.reply("You must enter a question to get an answer.")
    }

    const msg = await message.channel.send(`<a:LoadingAnimated:828057628512092202> Contacting Oracle...`).then((msg) => {
      setTimeout(function () {
        msg.edit(`<:8ball:828057590864805908> ~ ${response}`).then().catch(console.error);
      }, 4000)
    });

  }
}
