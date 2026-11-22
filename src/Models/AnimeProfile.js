const { Schema, model } = require('mongoose');

const acceptedSchema = new Schema({
    anilistId: String,
    title: String,
    fromUserId: String,
    at: Date,
}, { _id: false });

const animeProfileSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    discoverable: { type: Boolean, default: false },
    recommendations: { type: Boolean, default: false },
    bio: { type: String, default: '' },
    watching: { type: String, default: '' },
    favoriteId: { type: String, default: '' },
    favoriteTitle: { type: String, default: '' },
    genres: { type: [String], default: () => [] },
    accepted: { type: [acceptedSchema], default: () => [] },
});

module.exports = model('AnimeProfile', animeProfileSchema);
