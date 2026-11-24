const { Schema, model } = require('mongoose');
const schema = new Schema({
    guildId: String, userId: String, roleIds: { type: [String], default: () => [] },
    expiresAt: Date, lockUntil: Date, lockToken: String,
});
schema.index({ guildId: 1, userId: 1 }, { unique: true });
schema.index({ expiresAt: 1 }); // Not TTL: the Discord role must be removed first.
module.exports = model('Mute', schema);
