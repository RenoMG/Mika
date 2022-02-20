const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "laugh",
  category: "user",
  description: "User laughs",
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

    var options = ['https://media.tenor.com/images/5cb1114e4f1a94c33812a2c332da0c3a/tenor.gif',
      'https://media.tenor.com/images/1d3e261b0447150bad4aebe8de786d58/tenor.gif',
      'https://media.tenor.com/images/ee5bd7a68ab9e964d365bbfa1b2a6169/tenor.gif',
      'https://media.tenor.com/images/8a5927b8b5e9eaaa4dc8d5677cd70a7a/tenor.gif',
      'https://media.tenor.com/images/58da3874fbf792c6682bdbb577052e9d/tenor.gif',
      'https://media.tenor.com/images/6f567ef7cae93ca76de2346f28764ee9/tenor.gif',
      'https://media.tenor.com/images/0f44b42afe02eaed61fab75fb3e30f3a/tenor.gif',
      'https://media.tenor.com/images/3d8eb1e9c497abc46370cee9b55d682f/tenor.gif',
      'https://media.tenor.com/images/6938b88a35b56623bdcb498b6d51c43b/tenor.gif',
      'https://media.tenor.com/images/280056b1dc40deea3bf1131f6b9a1aa1/tenor.gif',
      'https://media.tenor.com/images/06c3b7485f9faee9bda5fa0afe548339/tenor.gif',
      'https://media.tenor.com/images/acea1a340a3e2e94b7d1da5dd522310d/tenor.gif',
      'https://media.tenor.com/images/96d132309f2874d32060dd5fb6534a49/tenor.gif',
      'https://media.tenor.com/images/b2f46d7880582fd101e3f62232338659/tenor.gif',
      'https://media.tenor.com/images/daa3b765710d9e3599ccc1cbb8c89128/tenor.gif',
      'https://media.tenor.com/images/f3e627844fbf59f887e558c31683af5d/tenor.gif',
      'https://media.tenor.com/images/3747822ce7f16b74d9cc572054ad6856/tenor.gif',
      'https://media.tenor.com/images/f5ed8b2664606d18d6e1cf3d2678ec36/tenor.gif',
      'https://media.tenor.com/images/db17bbcb693788625c8228d30bc5fc42/tenor.gif',
      'https://media.tenor.com/images/ceafd8f4497e8552cadb675236a8f2d1/tenor.gif',
      'https://media.tenor.com/images/944c28bdfb70f74c9f824916c4a3e601/tenor.gif',
      'https://media.tenor.com/images/f7354b8c66dcf774a0cd75d1806e0d56/tenor.gif',
      'https://media.tenor.com/images/ab8bd7abbdf3e1f0e15a58ddf0f769bc/tenor.gif',
      'https://media.tenor.com/images/1cc8ecb9e2057c5ddde8b722cda2ab7e/tenor.gif',
      'https://media.tenor.com/images/7f127e87401602e1f270d2cef72a5764/tenor.gif',
      'https://media.tenor.com/images/08c68f95a0e4f4eb28eed0e3e045112e/tenor.gif',
      'https://media.tenor.com/images/523fc436441162835c95db9ae5af0eb6/tenor.gif',
      'https://media.tenor.com/images/aecb1080da4c64724d87ddfefebc1616/tenor.gif',
      'https://media.tenor.com/images/1d7be2a6bde81d68277e361e52a0778b/tenor.gif',
      'https://media.tenor.com/images/b10cd2021d9e478527f391a2b072a97a/tenor.gif',
      'https://media.tenor.com/images/256bcdf43ce5cfac2d36b8d9060c38ee/tenor.gif',
      'https://media.tenor.com/images/a9ef5375bfde41a9f8d397d278487f90/tenor.gif',
      'https://media.tenor.com/images/d96c36d5f4e0dc4f83cc3b45c9444b4a/tenor.gif',
      'https://media.tenor.com/images/754ab6a4e6322f5d37d4594d14b17825/tenor.gif',
      'https://media.tenor.com/images/8fee0aa5f1545cc2867ec8bf328b761c/tenor.gif'];

    var response = options[Math.floor(Math.random() * options.length)];

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setImage(response)
      .setURL(response)
      .setTimestamp()
      .setDescription(`**${message.author} laughs.**`)
      .setFooter('Rodger | 😂 LAUGH!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
