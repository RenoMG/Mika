const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "fbi",
  aliases: [],
  category: "user",
  description: "FBI open up!",
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

    var options = ['https://media1.tenor.com/images/30134f761730a93ae16df5e8096c7841/tenor.gif?itemid=15241150',
      'https://media1.tenor.com/images/b61a679b69018476724e494b6c06f51f/tenor.gif?itemid=13107377',
      'https://media1.tenor.com/images/2ea8696fa31f4037f55ecb77e70eedea/tenor.gif?itemid=13656344',
      'https://media1.tenor.com/images/bb86bf7dfe35b084932248ef53b6bf29/tenor.gif?itemid=14552703',
      'https://media1.tenor.com/images/3b0016a54369d03e1c81cc04465b8d77/tenor.gif?itemid=15524876',
      'https://media1.tenor.com/images/049d7634b324eabfcc231d60da63ce3e/tenor.gif?itemid=14018832',
      'https://media1.giphy.com/media/2Wkblpy4kuakM/giphy.gif?cid=790b76119d8582c54568cb2bfdd4385ac62fec1975a9838a&rid=giphy.gif',
      'https://media1.tenor.com/images/6b038a3cbb6b890d5d828b21153c593c/tenor.gif?itemid=4732785',
      'https://media1.tenor.com/images/3623cd420edaca64a2c92c0fff65f79f/tenor.gif?itemid=17235369',
      'https://media1.tenor.com/images/ea5b068eaf413109c2d44044e15419b7/tenor.gif?itemid=16928811',
      'https://media1.tenor.com/images/9a4e9faafd35f135ab35d4ade6b8ecf2/tenor.gif?itemid=16454147',
      'https://media1.tenor.com/images/4189be5b4e7164483297716bdfc4090c/tenor.gif?itemid=15337411',
      'https://media1.tenor.com/images/6bd7f2423275e8819566ff2441704472/tenor.gif?itemid=14223767']

    var response = options[Math.floor(Math.random() * options.length)];

    //  message.channel.send(`${message.author} JUST DABBED ON ${member} `);

    if (!args[0]) {
      const embed = new MessageEmbed()
        .setColor("RANDOM")
        .setImage(response)
        .setURL(response)
        .setTimestamp()
        .setDescription(`**FBI OPEN UP!**`)
        .setFooter('Rodger | 👮 FBI!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
      return message.channel.send(embed);
    };

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${member} FBI OPEN UP!**`)
      .setFooter('Rodger | 👮 FBI!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
