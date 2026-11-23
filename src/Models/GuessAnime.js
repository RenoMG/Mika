const { Schema, model, models } = require('mongoose');

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
});

module.exports = models.GuessAnime || model('GuessAnime', guessAnimeSchema);
