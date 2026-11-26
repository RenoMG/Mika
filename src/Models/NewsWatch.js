const { Schema, model } = require('mongoose');

// What Anime News has already seen for one server: the story IDs per news site
// it follows. Kept apart from the server settings so a check never races a
// /config edit. A site missing here has not been read for this server yet.
const seenSource = new Schema({
    Source: { type: String, required: true },
    Seen: { type: [String], default: () => [] },
}, { _id: false });

const schema = new Schema({
    GuildID: { type: String, required: true },
    Sources: { type: [seenSource], default: () => [] },
    CheckedAt: Date,
    PostedAt: Date,
});
schema.index({ GuildID: 1 }, { unique: true });

module.exports = model('NewsWatch', schema);
