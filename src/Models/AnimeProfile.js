const { Schema, model } = require('mongoose');

const acceptedSchema = new Schema({
    anilistId: String,
    title: String,
    fromUserId: String,
    at: Date,
}, { _id: false });

const favoriteSchema = new Schema({
    anilistId: String,
    title: String,
}, { _id: false });

const watchingSchema = new Schema({
    anilistId: String,
    title: String,
    recommended: { type: Boolean, default: false },
    fromUserId: { type: String, default: '' },
}, { _id: false });

const animeProfileSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    discoverable: { type: Boolean, default: false },
    recommendations: { type: Boolean, default: false },
    bio: { type: String, default: '' },
    // Latest display name, else username. Used as the /findprofile label.
    nameLabel: { type: String, default: '' },
    // Lowercased username, global name, and nicknames Mika has seen. Capped.
    // Empty on older documents until that profile is saved or viewed.
    names: { type: [String], default: () => [] },
    // Free-text watching from before the list. Shown until the owner removes
    // that line. Adds, accepts, and clear do not rewrite it.
    watching: { type: String, default: '' },
    watchingList: { type: [watchingSchema], default: () => [] },
    // Legacy single favorite. Still read when `favorites` is empty, and still
    // written as a mirror of the first list entry when the owner edits the list.
    favoriteId: { type: String, default: '' },
    favoriteTitle: { type: String, default: '' },
    favorites: { type: [favoriteSchema], default: () => [] },
    genres: { type: [String], default: () => [] },
    tags: { type: [String], default: () => [] },
    // Older accepted recommendations. No longer written. Left on the document
    // so existing rows are not deleted.
    accepted: { type: [acceptedSchema], default: () => [] },
});

module.exports = model('AnimeProfile', animeProfileSchema);
