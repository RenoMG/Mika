const { Schema, model } = require('mongoose');

// What Blog Watcher has already seen for one server, kept apart from the server
// settings so a feed check never races a /config edit.
const schema = new Schema({
    GuildID: { type: String, required: true },
    FeedURL: { type: String, default: '' },
    Seen: { type: [String], default: () => [] },
    ETag: { type: String, default: '' },
    LastModified: { type: String, default: '' },
    CheckedAt: Date,
    PostedAt: Date,
});
schema.index({ GuildID: 1 }, { unique: true });

module.exports = model('BlogWatch', schema);
