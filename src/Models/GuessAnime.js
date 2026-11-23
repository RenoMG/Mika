const { Schema } = require('mongoose');
const { getConnection, ready } = require('../db/cacheConnection');

// Guess That Anime pool: titles, embed fields, and screenshot URLs. No image
// bytes. Per-server recent/shown state stays on GuessGuild, on the main database.
const guessAnimeSchema = new Schema({
    anilistId: { type: String, required: true, unique: true },
    idMal: { type: Number, required: true },
    titles: {
        romaji: { type: String, default: '' },
        english: { type: String, default: '' },
        native: { type: String, default: '' },
    },
    synonyms: { type: [String], default: () => [] },
    media: { type: Schema.Types.Mixed, required: true },
    screenshots: { type: [String], default: () => [] },
    fetchedAt: { type: Date, required: true },
    lastAccessedAt: { type: Date, default: () => new Date() },
}, {
    bufferCommands: false,
    collection: 'guessanimes',
});

guessAnimeSchema.index({ lastAccessedAt: 1 });

function get() {
    const conn = getConnection();
    if (!conn || !ready()) return null;
    return conn.models.GuessAnime || conn.model('GuessAnime', guessAnimeSchema);
}

module.exports = { get, schema: guessAnimeSchema };
