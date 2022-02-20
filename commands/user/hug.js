const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "hug",
  category: "user",
  description: "Hugs mentioned user.",
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

    var options = ['https://media1.tenor.com/images/24ac13447f9409d41c1aecb923aedf81/tenor.gif?itemid=5026057',
      'https://media1.tenor.com/images/2d4138c7c24d21b9d17f66a54ee7ea03/tenor.gif?itemid=12535134',
      'https://media1.tenor.com/images/11b756289eec236b3cd8522986bc23dd/tenor.gif?itemid=10592083',
      'https://media1.tenor.com/images/b445cd212986c5d53d2bdf7cd31f6c34/tenor.gif?itemid=9894421',
      'https://media1.tenor.com/images/f2fe21d5b4fc2f4a258e4708b10c966c/tenor.gif?itemid=5179004',
      'https://media1.tenor.com/images/474ce31f4df1e3592f5ec787f915eb37/tenor.gif?itemid=15579685',
      'https://media1.tenor.com/images/630763778dde12ea9fe4a03f1e9a325d/tenor.gif?itemid=4127473',
      'https://media1.tenor.com/images/eb6536e7e2fd8d06a62fd803fd046215/tenor.gif?itemid=15597747',
      'https://media1.tenor.com/images/68f16d787c2dfbf23a4783d4d048c78f/tenor.gif?itemid=9512793',
      'https://media1.tenor.com/images/29a2d3fc01c709ffb2f38cd9dfaf04d2/tenor.gif?itemid=3877439',
      'https://media1.tenor.com/images/7009e2b810f5517e369c39be0404982a/tenor.gif?itemid=8656017',
      'https://media1.tenor.com/images/f20151a1f7e003426ca7f406b6f76c82/tenor.gif?itemid=13985247',
      'https://media1.tenor.com/images/fd47e55dfb49ae1d39675d6eff34a729/tenor.gif?itemid=12687187',
      'https://media1.tenor.com/images/a71b123666e08bb6ad336cd1625c0cdb/tenor.gif?itemid=3463479',
      'https://media1.tenor.com/images/bf25aaed21a1e01260d8edc3681254b2/tenor.gif?itemid=7660036',
      'https://media1.tenor.com/images/dbd5f352c80e3445b801d548ca330a6a/tenor.gif?itemid=14214458',
      'https://media1.tenor.com/images/68a86beda361994b2dd38ade6a252602/tenor.gif?itemid=3904776',
      'https://media1.tenor.com/images/0be55a868e05bd369606f3684d95bf1e/tenor.gif?itemid=7939558',
      'https://media1.tenor.com/images/1a889a8210f296ff54fc758a520df493/tenor.gif?itemid=4951192',
      'https://media1.tenor.com/images/e214725410cdb1340e0dd8846c2c89e0/tenor.gif?itemid=4532952',
      'https://media1.tenor.com/images/cb3031d8f1fb32d097ec899592ab7eec/tenor.gif?itemid=5406385',
      'https://media1.tenor.com/images/2104831bfb1d8b9c9fdc24985972059d/tenor.gif?itemid=15055257',
      'https://media1.tenor.com/images/ab49becf34b548106d6852fe6b0ce380/tenor.gif?itemid=16033812',
      'https://media1.tenor.com/images/ff8d4b3b081605d92c19adff3ea770a5/tenor.gif?itemid=11557800',
      'https://media1.tenor.com/images/c538b0bff12116b66430121b49565aa0/tenor.gif?itemid=13576468'];

    var response = options[Math.floor(Math.random() * options.length)];

    var sayings = [", aww.",
      ", 😳",
      ", Now that's cute.",
      "",
      ", adorable!",
      ", so sweet!",
      ", 💓",
      ", now just look at that!"];

    var sayingsdat = sayings[Math.floor(Math.random() * sayings.length)];

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} hugs ${member}${sayingsdat}**`)
      .setFooter('Rodger | 💌 HUG!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
