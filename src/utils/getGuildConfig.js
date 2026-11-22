const configurationDB = require('../Models/ConfigurationDB');
const infractionsDB = require('../Models/InfractionsDB');
const warnDB = require('../Models/WarnDB');

// returnDocument: 'after' is mongoose 9's name for new: true (return the upserted document).
const UPSERT = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true };

// Creates the guild configuration document on first lookup. Later reads return the same doc.
async function getGuildConfig(guildId) {
    if (!guildId) throw new TypeError('A guild id was not provided.');

    return configurationDB.findOneAndUpdate(
        { GuildID: guildId },
        { $setOnInsert: configurationDB.guildConfigInsert(guildId) },
        UPSERT
    );
}

// Used where a command reads warns or infractions as if the row already exists.
// Display commands that treat a missing row as "no infractions" still use findOne.
async function getUserInfractions(guildId, userId, userTag) {
    if (!guildId || !userId) throw new TypeError('A guild id and user id were not provided.');

    return infractionsDB.findOneAndUpdate(
        { GuildID: guildId, UserID: userId, UserTag: userTag },
        {
            $setOnInsert: {
                GuildID: guildId,
                UserID: userId,
                UserTag: userTag,
                Warns: [],
                Mutes: [],
                Kicks: [],
                Bans: [],
            },
        },
        UPSERT
    );
}

async function getUserWarns(guildId, userId, userTag) {
    if (!guildId || !userId) throw new TypeError('A guild id and user id were not provided.');

    return warnDB.findOneAndUpdate(
        { GuildID: guildId, UserID: userId, UserTag: userTag },
        {
            $setOnInsert: {
                GuildID: guildId,
                UserID: userId,
                UserTag: userTag,
                Content: [],
            },
        },
        UPSERT
    );
}

function docCount(doc, key) {
    return doc && Array.isArray(doc[key]) ? doc[key].length : 0;
}

module.exports = {
    getGuildConfig,
    getUserInfractions,
    getUserWarns,
    docCount,
};
