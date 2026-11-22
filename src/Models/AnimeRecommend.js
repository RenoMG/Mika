const { Schema, model } = require('mongoose');

const pendingSchema = new Schema({
    publicId: { type: String, required: true, unique: true },
    senderId: { type: String, required: true },
    targetId: { type: String, required: true },
    guildId: { type: String, required: true },
    anilistId: { type: String, required: true },
    title: { type: String, default: '' },
    media: { type: Schema.Types.Mixed, default: () => ({}) },
    status: { type: String, default: 'pending' },
}, { timestamps: true });

pendingSchema.index({ targetId: 1, anilistId: 1, status: 1 });
pendingSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const guardSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    lastSentAt: Date,
    receivedDay: { type: String, default: '' },
    receivedCount: { type: Number, default: 0 },
});

module.exports = {
    PendingRecommendation: model('PendingRecommendation', pendingSchema),
    RecommendGuard: model('RecommendGuard', guardSchema),
};
