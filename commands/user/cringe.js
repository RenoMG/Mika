const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "cringe",
  category: "user",
  description: "User cringes",
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

    var options = ['https://media.tenor.com/images/58b930b25f43202625e72493a82ebc78/tenor.gif',
      'https://media.tenor.com/images/8d5729d2b9e70cfa6503a4c7d54f9847/tenor.gif',
      'https://media.tenor.com/images/f0036458f596c81e8eae9dfdf3596944/tenor.gif',
      'https://media.tenor.com/images/924d3c6a4bc528a201649a0637b4fdec/tenor.gif',
      'https://media.tenor.com/images/13f16b84f9122bc42ca5ba1058cc22ea/tenor.gif',
      'https://media.tenor.com/images/1c8dc71f77bc2e1db9ddd03f00e78f0c/tenor.gif',
      'https://media.tenor.com/images/6053ae7f94634a5c5e33a42362ef683a/tenor.gif',
      'https://media.tenor.com/images/f0108b7cc6165712f206ff0cbb9f6dd0/tenor.gif',
      'https://media.tenor.com/images/e5241d1a804669280218d0cb47893acc/tenor.gif',
      'https://media.tenor.com/images/3102ac938ee2b3b0607cb5238f3020d1/tenor.gif',
      'https://media.tenor.com/images/480cd5c501f45ad8168a6cff94f22433/tenor.gif',
      'https://media.tenor.com/images/5886d117ea3a654924b2ea760df639d9/tenor.gif',
      'https://media.tenor.com/images/020a1211d2cefc3a1ea8f90111d6e20f/tenor.gif',
      'https://media.tenor.com/images/cd90f1dad964b68f10b9766ebb2af50a/tenor.gif',
      'https://media.tenor.com/images/3c959d9169218c996845168a6813cb08/tenor.gif',
      'https://media.tenor.com/images/ca2c96f8c43cec1656fccd5b704612d1/tenor.gif',
      'https://media.tenor.com/images/a24fbe6a044ed6e09125b406bbfa0697/tenor.gif',
      'https://media.tenor.com/images/15fd4ac03688801db2ff717d34773f17/tenor.gif',
      'https://media.tenor.com/images/703237903d63fcc7d418affe07cc07bc/tenor.gif',
      'https://media.tenor.com/images/03479fc6dbbc0c9d9061eb4d2be80399/tenor.gif',
      'https://media.tenor.com/images/526adbce36971220bba8242f510b90e1/tenor.gif',
      'https://media.tenor.com/images/d5a2fe221dca147da79aaca5a868273c/tenor.gif',
      'https://media.tenor.com/images/c644da2de6094e4486832373d62ffdd1/tenor.gif',
      'https://media.tenor.com/images/4e605df7ae7056d6c21dca16351a926e/tenor.gif',
      'https://media.tenor.com/images/34ce9e506527ca091ae0596ae1949a2e/tenor.gif',
      'https://media.tenor.com/images/174b31b290214cae885a85e6b238d0c3/tenor.gif',
      'https://media.tenor.com/images/60a390871766167d0f239ae05466bf56/tenor.gif',
      'https://media.tenor.com/images/30b3fcf2b971fec3f778a8548c8a366b/tenor.gif',
      'https://media.tenor.com/images/e3cfc4ea06abde446a9fdbc65d388e5f/tenor.gif'];

    var response = options[Math.floor(Math.random() * options.length)];

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} cringes.**`)
      .setFooter('Rodger | 😬 CRINGE!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
