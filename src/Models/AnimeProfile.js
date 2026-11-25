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

// Favorite characters, staff, and studios. `id` is the AniList id of that kind.
const entitySchema = new Schema({
    id: String,
    name: String,
}, { _id: false });

// Optional per-entry details. Every list row can carry them. Missing on rows
// saved before they existed; nothing is defaulted, so old rows stay as they were.
const details = {
    progress: Number,
    episodes: Number,
    score: Number,
    notes: String,
    startedAt: Date,
    completedAt: Date,
    rewatches: Number,
    duration: Number,
    format: String,
    genres: { type: [String], default: undefined },
    year: Number,
    updatedAt: Date,
};

// Planning, paused, dropped, and rewatching rows.
const libraryEntrySchema = new Schema({
    anilistId: String,
    title: String,
    recommended: { type: Boolean, default: false },
    fromUserId: { type: String, default: '' },
    addedAt: Date,
    ...details,
}, { _id: false });

const customEntrySchema = new Schema({
    anilistId: String,
    title: String,
}, { _id: false });

const customListSchema = new Schema({
    id: String,
    name: String,
    createdAt: Date,
    entries: { type: [customEntrySchema], default: () => [] },
}, { _id: false });

const anilistLinkSchema = new Schema({
    id: String,
    name: String,
    verifiedAt: Date,
    importedAt: Date,
}, { _id: false });

const watchingSchema = new Schema({
    anilistId: String,
    title: String,
    recommended: { type: Boolean, default: false },
    fromUserId: { type: String, default: '' },
    // Missing on rows saved before this field existed. Display then uses
    // array position, later meaning newer. No default, so a save does not
    // stamp those older rows with "now".
    addedAt: Date,
    ...details,
}, { _id: false });

const completedSchema = new Schema({
    anilistId: String,
    title: String,
    recommended: { type: Boolean, default: false },
    ...details,
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
    completedList: { type: [completedSchema], default: () => [] },
    // Legacy single favorite. Still read when `favorites` is empty, and still
    // written as a mirror of the first list entry when the owner edits the list.
    favoriteId: { type: String, default: '' },
    favoriteTitle: { type: String, default: '' },
    favorites: { type: [favoriteSchema], default: () => [] },
    planningList: { type: [libraryEntrySchema], default: () => [] },
    pausedList: { type: [libraryEntrySchema], default: () => [] },
    droppedList: { type: [libraryEntrySchema], default: () => [] },
    rewatchingList: { type: [libraryEntrySchema], default: () => [] },
    customLists: { type: [customListSchema], default: () => [] },
    favoriteCharacters: { type: [entitySchema], default: () => [] },
    favoriteStaff: { type: [entitySchema], default: () => [] },
    favoriteStudios: { type: [entitySchema], default: () => [] },
    genres: { type: [String], default: () => [] },
    tags: { type: [String], default: () => [] },
    // Share list updates in a server's Watch Feed channel, when the server has one.
    activityFeed: { type: Boolean, default: false },
    // Let people who can see this profile follow it and get updates by DM.
    allowFollows: { type: Boolean, default: false },
    // Set only after the owner proved they control the AniList account.
    anilist: { type: anilistLinkSchema, default: undefined },
    // Older accepted recommendations. No longer written. Left on the document
    // so existing rows are not deleted.
    accepted: { type: [acceptedSchema], default: () => [] },
});

animeProfileSchema.set('optimisticConcurrency', true);
animeProfileSchema.index({ discoverable: 1, names: 1 });
module.exports = model('AnimeProfile', animeProfileSchema);
