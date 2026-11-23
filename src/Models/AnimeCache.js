const { Schema } = require('mongoose');
const { getConnection, ready } = require('../db/cacheConnection');

// Shared AniList/Kitsu cache on the cache connection. expireAt is a TTL index.
// Reads also treat a past expireAt as a miss, because Mongo's TTL monitor lags.
// lastAccessedAt is the LRU order for the entry cap. The key is an exact match.
const animeCacheSchema = new Schema({
    key: { type: String, required: true, unique: true },
    kind: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    expireAt: { type: Date, required: true },
    lastAccessedAt: { type: Date, default: () => new Date() },
}, {
    bufferCommands: false,
    collection: 'animecaches',
});

animeCacheSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
animeCacheSchema.index({ kind: 1, lastAccessedAt: 1 });

function get() {
    const conn = getConnection();
    if (!conn || !ready()) return null;
    return conn.models.AnimeCache || conn.model('AnimeCache', animeCacheSchema);
}

module.exports = { get, schema: animeCacheSchema };
