const { Schema, model } = require('mongoose');

// The only anime data Mika stores about a person: which public AniList and
// MyAnimeList accounts they proved are theirs. Everything shown on /profile is
// read from those sites and cached briefly, never stored here.
const siteSchema = new Schema({
    id: String,
    name: String,
    verifiedAt: Date,
}, { _id: false });

const linkSchema = new Schema({
    userId: { type: String, required: true },
    // Latest Discord display name, for /findprofile labels.
    nameLabel: { type: String, default: '' },
    // Lowercased Discord names Mika has seen, for /findprofile. Capped.
    names: { type: [String], default: () => [] },
    anilist: { type: siteSchema, default: undefined },
    mal: { type: siteSchema, default: undefined },
});

linkSchema.set('optimisticConcurrency', true);
linkSchema.index({ userId: 1 }, { unique: true });
linkSchema.index({ names: 1 });

module.exports = model('ProfileLink', linkSchema);
