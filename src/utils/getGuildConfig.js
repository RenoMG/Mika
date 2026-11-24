const configurationDB = require('../Models/ConfigurationDB');
const { storedId } = require('./safeId');
const { createCache } = require('../anime/cache');
const snapshots = createCache({ max: 1000, ttlMs: 5000 });
const pending = new Map();
const UPSERT = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true };
function invalidateGuildConfig(id) { snapshots.delete(String(id)); }
function peekGuildConfig(id) { return snapshots.get(String(id)) || null; }
async function read(id) {
    let doc = await configurationDB.findOne({ GuildID: id });
    if (!doc) {
        try {
            doc = await configurationDB.findOneAndUpdate({ GuildID: id },
                { $setOnInsert: configurationDB.guildConfigInsert(id) }, UPSERT);
        } catch (error) {
            if (error.code !== 11000) throw error;
            doc = await configurationDB.findOne({ GuildID: id });
        }
    }
    const snapshot = doc?.toObject ? doc.toObject() : doc;
    if (snapshot) snapshots.set(id, snapshot);
    return snapshot;
}
async function getGuildConfig(guildId, { fresh = false } = {}) {
    const id = storedId(guildId, 'A guild id');
    let snapshot = !fresh && snapshots.get(id);
    if (!snapshot) {
        if (!pending.has(id)) pending.set(id, read(id).finally(() => pending.delete(id)));
        snapshot = await pending.get(id);
    }
    // A new document per caller: editors cannot mutate the shared cache.
    return snapshot ? configurationDB.hydrate(JSON.parse(JSON.stringify(snapshot))) : null;
}
module.exports = { getGuildConfig, peekGuildConfig, invalidateGuildConfig };
