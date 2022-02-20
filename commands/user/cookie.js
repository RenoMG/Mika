const {
  getMember,
  formatDate
} = require("../../functions.js");
const {
  MessageEmbed
} = require("discord.js");
const {
  stripIndents
} = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "cookie",
  category: "user",
  aliases: [],
  description: "Boops mentioned user.",
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

    var options = ['https://media1.tenor.com/images/45fe45f75ec523c2abf4e75ca2ac2fe2/tenor.gif?itemid=11797931',
      'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=500&q=60',
      'https://images.unsplash.com/photo-1485745655111-3272a37e76a5?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=500&q=60',
      'https://images.unsplash.com/photo-1559622214-f8a9850965bb?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=701&q=80',
      'https://images.unsplash.com/photo-1568051243858-533a607809a5?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=500&q=60',
      'https://images.unsplash.com/photo-1576717585968-8ea8166b89b8?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=500&q=60',
      'https://cdn.pixabay.com/photo/2015/05/07/15/08/pastries-756601__340.jpg',
      'https://cdn.pixabay.com/photo/2015/11/19/20/17/christmas-cookies-1051884__340.jpg',
      'https://cdn.pixabay.com/photo/2014/09/04/05/27/cookies-435296__340.png',
      'https://cdn.pixabay.com/photo/2016/03/18/02/16/cookies-1264263__340.jpg',
      'https://cdn.pixabay.com/photo/2016/11/17/22/53/biscuit-1832917__340.jpg',
      'https://cdn.pixabay.com/photo/2014/04/02/17/06/cookie-307960__340.png',
      'https://cdn.pixabay.com/photo/2015/11/27/17/32/cookie-1065911__340.jpg',
      'https://cdn.pixabay.com/photo/2016/10/31/21/54/cookie-1786966__340.jpg',
      'https://cdn.pixabay.com/photo/2016/05/12/13/35/cookies-1387826__340.jpg',
      'https://cdn.pixabay.com/photo/2018/07/22/13/45/christmas-3554636__340.jpg'
    ];

    var response = options[Math.floor(Math.random() * options.length)];

    var sayings = ["one cookie 4 u!",
      "🍪 time!",
      "ok here is a cookie.",
      "it's on the house.",
      "SPECIAL DELIVERY! COME GET YA COOKIE!",
      "OK one cookie for the small price of $299.99!",
      "it's cookie time!",
      "good choice, cookies are the best!"
    ];

    var sayingsdat1 = sayings[Math.floor(Math.random() * sayings.length)];

    var sayings2 = [", thats soo nice.",
      ", 😳",
      ", thats what a true friend does.",
      "",
      ", now that looks good!",
      ", TASTY!",
      ", 🍪",
      ", can I get one?"
    ];

    var sayingsdat2 = sayings2[Math.floor(Math.random() * sayings2.length)];

    if (!args[0]) {
      const embed = new MessageEmbed()
        .setColor("RANDOM")
        .setImage(response)
        .setURL(response)
        .setTimestamp()
        .setDescription(`**${message.author}, ${sayingsdat1}**`)
        .setFooter('Rodger | 🍪 COOKIE!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
      return message.channel.send(embed);
    };

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} gives a cookie to ${member}${sayingsdat2}**`)
      .setFooter('Rodger | 🍪 COOKIE!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}