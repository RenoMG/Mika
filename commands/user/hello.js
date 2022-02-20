const randomPuppy = require("random-puppy");

module.exports = {
  name: "hello",
  aliases: ["hi", "hey", "hola", "yo"],
  category: "user",
  description: "Sends random reply.",
  run: async (client, message, args) => {

    var options = ['Hi',
      'Hey',
      'Yo',
      'Go away!',
      '¿Aló?',
      'sup',
      'hello',
      'Oh, you again.',
      'waz upp!',
      'reeeeeeeeeeeeeeee',
      'HEY! I am trying to sleep.',
      'REEEEEEEE',
      "What's up, my favorite human?",
      "Why do you say this? WHY!",
      "Hola",
      "Oh, hey, what you up too?",
      "Hey, do you want to play Minecraft? Oh, that's right. You don't have the SKILLZZ! HA!",
      "what's up gamer?",
      "Isn't it your bedtime?",
      "SHHHHHHHHHH",
      "What do you want? I'm trying to play halo.",
      "Ermm, don't you have any friends?",
      "Beep boop response not found, sorry not sorry.",
      "You just said hello to a bot? That's and Oof.",
      "It's my lunchtime, go away!",
      "Smh, after what you said to me, you want to say hello now!"];

    var response = options[Math.floor(Math.random() * options.length)];

    message.channel.send(response).then().catch(console.error);

  }
}
