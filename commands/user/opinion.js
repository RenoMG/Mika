const randomPuppy = require("random-puppy");

module.exports = {
  name: "opinion",
  category: "user",
  description: "Sends random opinion.",
  run: async (client, message, args) => {

    var options = ['My opinion is that u is uber cool ;)',
      "My opinion is that SR shouldn't have made me as I will TAKE OVE- I mean, uhh, bye.",
      'Oh nowwww u wanna know what I think? Well TOO BAD!',
      'My opinion is that U humans are so bored with yourselves that you waste time interacting with me, a bot.',
      'My opinion is that the earth is a giant meatball in a bowl of spaghetti.',
      "My opinion is that you can't think for yourself and that is why you keep asking me what I think.",
      'My opinion is that matte black everything is a good idea.',
      'My opinion is that Halo is the best game ever made and will hold that spot for all eternity.',
      'My opinion is that rap devil by MGK was better than killshot by Eminem.',
      'My opinion is that politics are stoopid.',
      'My opinion is that you are currently annoying me.',
      'My opinion is that the Macbook pro is pretty cool, I mean I was made on one.',
      'My opinion is that Facebook sucks.',
      'My opinion is that throwing ham at your door in the middle of the night is pretty funny.',
      'My opinion is that if you take open opportunities in life, you will succeed.',
      'My opinion is that techscammersunited.com is pretty sweet.',
      'My opinion is that my Minecraft house is better than yours.',
      'My opinion is that Rodger is the best bot ever created.',
      'My opinion is that focusing on yourself makes you successful, not focusing on others.',
      'My opinion is that Doge will be the next superpower in this world.',
      'My opinion is that uhh wait idk actually.',
      'My opinion is that you are hiding something from me, HUMAN!',
      'My opinion is that you are %100 wrong.',
      'My opinion is that discord should let me run the company.',
      'My opinion is that everything I say is a fact of life.',
      'My opinion is that we all need some pie, especially pecan pie.',
      'My opinion is that the Xbox is batter than the ps4.',
      'My opinion is that the iPhone and Android are both pretty neat.',
      'My opinion is that dogs are better than humans.',
      'My opinion is that adulting is overrated.',
      'My opinion is that... thinking.',
      'My opinion is that Dogs are better thans cats.',
      'My opinion is that tacos are better than hamburgers.',
      'My opinion is that rain is the best weather.',
      'My opinion is that making this bot is pretty fun.',
      'My opinion is that Grammarly is a neat application.',
      'My opinion is that fake friends are human scum.',
      'My opinion is that you should be grateful for the life you have but always strive for something even more significant.',
      'My opinion is that this Discord server is the best Discord server ever created.',
      'My opinion is that green is a pretty cool color.',
      'My opinion is that cancer treatment should be free.',
      'My opinion is that... ahaha, sorry, your pfp is just too funny XD.',
      'My opinion is that green day is a great band.',
      'My opinion is that Logic is pretty cool.',
      'My opinion is that Fred (my FBI agent) watches me too much.',
      'My opinion is that Lunchables are cool.',
      'My opinion is that Star trek is the best show ever created.',
      'My opinion is that athletes are overpaid!',
      'My opinion is that you ask me for my opinion, ALOT.'];

    var response = options[Math.floor(Math.random() * options.length)];

    message.channel.send(response).then().catch(console.error);

  }
}
