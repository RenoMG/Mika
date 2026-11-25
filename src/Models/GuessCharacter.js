const { Schema } = require('mongoose');
const { getConnection, ready } = require('../db/cacheConnection');

// Character rounds: names, one AniList image URL, and the anime they are from.
// Text only, roughly 0.5 KB a document. Lives on the cache connection.
const guessCharacterSchema = new Schema({
    characterId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    native: { type: String, default: '' },
    alternative: { type: [String], default: () => [] },
    image: { type: String, required: true },
    favourites: { type: Number, default: 0 },
    animeId: { type: String, default: '' },
    animeTitle: { type: String, default: '' },
    url: { type: String, default: '' },
    fetchedAt: { type: Date, required: true },
    lastAccessedAt: { type: Date, default: () => new Date() },
}, {
    bufferCommands: false,
    collection: 'guesscharacters',
});

guessCharacterSchema.index({ lastAccessedAt: 1 });

function get() {
    const conn = getConnection();
    if (!conn || !ready()) return null;
    return conn.models.GuessCharacter || conn.model('GuessCharacter', guessCharacterSchema);
}

module.exports = { get, schema: guessCharacterSchema };
