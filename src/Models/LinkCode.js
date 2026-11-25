const { Schema, model } = require('mongoose');

// A pending ownership check. The owner puts `code` in their profile bio on
// `site`, then Mika reads the bio to confirm it. Rows expire after 30 minutes.
const codeSchema = new Schema({
    userId: { type: String, required: true },
    site: { type: String, required: true },
    username: { type: String, required: true },
    code: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
});

codeSchema.index({ userId: 1, site: 1 }, { unique: true });
codeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('LinkCode', codeSchema);
