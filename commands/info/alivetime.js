const moment = require("moment");
require("moment-duration-format");

module.exports = {
  name: "alivetime",
  category: "info",
  aliases: ["uptime", "runtime"],
  description: "Returns bot uptime.",
  run: async (client, message, args) => {

    let uptime = ``;
    let { version } = require("discord.js");
    let statsmoment = require("moment");
    let duration = statsmoment.duration(client.uptime).format(" D [days], H [hrs], m [mins], s [secs]");

    uptime += `${duration}`;

    const msg = await message.channel.send(`Calculating alivetime...`);

    msg.edit(`I have been running for ${uptime}`)
  }
}
