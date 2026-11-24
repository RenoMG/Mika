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
    activeKey: String,
    deliveryState: { type: String, default: 'reserved' },
    processingUntil: Date,
    deliveryId: String,
}, { timestamps: true });

pendingSchema.index({ activeKey: 1 }, { unique: true, sparse: true });
pendingSchema.index({ targetId: 1, anilistId: 1, status: 1 });
pendingSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const guardSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    lastSentAt: Date,
    reservationId: String,
    receivedDay: { type: String, default: '' },
    receivedCount: { type: Number, default: 0 },
});

// One "your list is full" DM per sender and target per UTC day.
// The day key is the guard. The TTL only drops old rows.
const fullNoticeSchema = new Schema({
    senderId: { type: String, required: true },
    targetId: { type: String, required: true },
    day: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

fullNoticeSchema.index({ senderId: 1, targetId: 1, day: 1 }, { unique: true });
fullNoticeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 48 });

module.exports = {
    PendingRecommendation: model('PendingRecommendation', pendingSchema),
    RecommendGuard: model('RecommendGuard', guardSchema),
    FullListNotice: model('FullListNotice', fullNoticeSchema),
};
