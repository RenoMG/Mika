const { Schema, model, models } = require('mongoose');

// Shared AniList/Kitsu cache. expireAt is a TTL index, so Mongo deletes the
// document when it is due. The key is an exact indexed lookup, never a regex.
const animeCacheSchema = new Schema({
    key: { type: String, required: true, unique: true },
    kind: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    expireAt: { type: Date, required: true },
});

animeCacheSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = models.AnimeCache || model('AnimeCache', animeCacheSchema);
