const randomPuppy = require("random-puppy");
const request = require('request');


module.exports = {
  name: "joke",
  category: "user",
  description: "Sends random joke.",
  run: async (client, message, args) => {
    let options = {
      headers: {
        'User-Agent': 'Rodger Discord Bot'
      },
      json: true
    };

    request('https://icanhazdadjoke.com/', options, (err, res, body) => {
      if (err) {
        return;
      }
      message.channel.send(body.joke);
    });


  }
}
