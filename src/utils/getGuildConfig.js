const configurationDB = require('../Models/ConfigurationDB');
const { storedId } = require('./safeId');

// returnDocument: 'after' is mongoose 9's name for new: true (return the upserted document).
const UPSERT = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true };

// Creates the guild configuration document on first lookup. Later reads return the same doc.
async function getGuildConfig(guildId) {
    const id = storedId(guildId, 'A guild id');

    return configurationDB.findOneAndUpdate(
        { GuildID: id },
        { $setOnInsert: configurationDB.guildConfigInsert(id) },
        UPSERT
    );
}

module.exports = { getGuildConfig };
