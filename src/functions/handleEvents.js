const { redact } = require('../utils/redact');
module.exports = (client) => {
    client.handleEvents = async (eventFiles) => {
        for (const file of eventFiles) {
            const event = require(`../events/${file}`);
            const run = (...args) => Promise.resolve().then(() => event.execute(...args, client))
                .catch((error) => console.error(`Event ${event.name} failed.`, redact(error)));
            if (event.once) client.once(event.name, run);
            else client.on(event.name, run);
        }
    };
};
