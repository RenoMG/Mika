const { Schema, model } = require('mongoose');

const warnSchema = new Schema({
    GuildID: String,
    UserID: String,
    UserTag: String,
    Content: { type: Array, default: () => [] },
});

warnSchema.index({ GuildID: 1, UserID: 1 }, { unique: true });
warnSchema.set('optimisticConcurrency', true);
warnSchema.post('init', function fillMissingWarnContent() {
    if (!Array.isArray(this.Content)) this.Content = [];
});

module.exports = model('WarnDB', warnSchema);
