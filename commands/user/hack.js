const { getMember, formatDate } = require("../../functions.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "hack",
  category: "user",
  aliases: ["hacc"],
  description: "'hacks' mentioned user.",
  run: async (client, message, args, user) => {

    const member = getMember(message, args.join(" "));

    // Member variables
    const joined = formatDate(member.joinedAt);
    const roles = member.roles
      .cache.filter(r => r.id !== message.guild.id)
      .map(r => r)
      .join(", ") || "none";

    // User variables
    const created = formatDate(member.user.createdAt);

    var options = ['https://media1.tenor.com/images/45fe45f75ec523c2abf4e75ca2ac2fe2/tenor.gif?itemid=11797931'];

    var response = options[Math.floor(Math.random() * options.length)];

    var sayings = [`BOOM! ${message.author} HACKED ${member} WITH THE POWER OF NOTHING!`,
      "Hacc failed.",
      "lol jk",
    `OMG! ${message.author} HACKED ${member}! Better hide all them search histories!`,
      "wow big hacc",
    `${message.author} To finish this hack please pay 4 payments of $899.99!`,
      "*computer noises*",
      "hehe and u thought that would work!",
      "Doge said go away.",
      "Wait what was I doing?",
      "Wait, what is a computer?",
    `WOW the hacc worked! ${member} better hide all them pictures of toes...`,
      `Errrr.... System crash <:f_:828057664361594900>`,
      `No, I'm Dirty dan! Wait what...`,
    `WOW hack is complete! ${member} sorry but your Minecraft chats are now exposed.`,
      `*Fart noises*`,
      `Wait who are you?`,
      `Beep Boop`];

    var sayingsdat1 = sayings[Math.floor(Math.random() * sayings.length)];

    var sayings2 = [`Contacting doge`,
      "Calling tech support",
      "Texting Bill Gates",
      `Texting Elon Musk`,
      "Asking Mark Zuckerberg for your facebook data",
      `Loading resources`,
      "Starting up BTC mining rig",
      "Powering the CPU",
      "Thinking",
      "Logging into the Microsoft secure server",
      "Calling my mom",
      "Opening twitter",
      "Starting the microwave",
      "Looking up a tutorial",
      "Browsing the darkweb",
      "Emailing discord"];

    var sayingsdat2 = sayings2[Math.floor(Math.random() * sayings2.length)];

    if (!args[0]) {
      return message.channel.send(`${message.author}, Please enter a username!`);
    };


    if (message.author.id === member.id) {
      return message.reply("Haha, you want to hack yourself? DENIED!");
    }

    const msg = await message.channel.send(`${sayingsdat2} <a:LoadingAnimated:828057628512092202>`).then((msg) => {
      setTimeout(function () {
        msg.edit(`${sayingsdat1}`);
      }, 4000)
    });

  }
}
