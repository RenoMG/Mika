const { Schema, model } = require('mongoose');

// One row per follower and followed profile. Updates arrive by DM. `failures`
// counts DMs in a row that could not be delivered; the row is removed at the cap.
const followSchema = new Schema({
    followerId: { type: String, required: true },
    targetId: { type: String, required: true },
    failures: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});

followSchema.index({ followerId: 1, targetId: 1 }, { unique: true });
followSchema.index({ targetId: 1, createdAt: 1 });

module.exports = model('AnimeFollow', followSchema);
