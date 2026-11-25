const { Schema, model } = require('mongoose');

// A pending AniList ownership check. The owner puts `code` in their AniList
// bio, then Mika reads the bio to confirm it. Rows expire after 30 minutes.
const linkSchema = new Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    code: { type: String, required: true },
    mode: { type: String, default: 'merge' },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
});

linkSchema.index({ userId: 1 }, { unique: true });
linkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('AnilistLink', linkSchema);
