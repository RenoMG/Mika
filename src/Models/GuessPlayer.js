const { Schema, model, models } = require('mongoose');

// One season title: the quarter (for example 2026-Q4) and the final rank, 1 to 3.
const titleSchema = new Schema({
    season: { type: String, required: true },
    rank: { type: Number, required: true },
}, { _id: false });

// Counters that achievements read. Each is a plain number, so updates use $inc.
const countersSchema = new Schema({
    noHintWins: { type: Number, default: 0 },
    fastWins: { type: Number, default: 0 },
    wagerWins: { type: Number, default: 0 },
    bigWagerWins: { type: Number, default: 0 },
    duelWins: { type: Number, default: 0 },
    duelLosses: { type: Number, default: 0 },
    characterWins: { type: Number, default: 0 },
    giftedTotal: { type: Number, default: 0 },
    shieldsUsed: { type: Number, default: 0 },
}, { _id: false });

// Wins and crystals belong to one Discord user in one server. The leaderboard
// sorts by wins (all time) or seasonWins (the current Pacific-time quarter).
const guessPlayerSchema = new Schema({
    userID: { type: String, required: true },
    guildID: { type: String, required: true },
    wins: { type: Number, default: 0 },
    crystals: { type: Number, default: 0 },
    // Personal rounds only: wins in a row, the best run, and rounds given up.
    streak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    gaveUp: { type: Number, default: 0 },
    plays: { type: [Date], default: () => [] },
    recentFranchises: { type: [require('./GuessHistory')], default: () => [] },
    // Quarterly season. seasonWins belongs to `season`; a win in a new season resets it.
    season: { type: String, default: '' },
    seasonWins: { type: Number, default: 0 },
    titles: { type: [titleSchema], default: () => [] },
    // Streak Shields held (at most one). One is used instead of resetting a streak.
    shields: { type: Number, default: 0 },
    achievements: { type: [String], default: () => [] },
    packsWon: { type: [String], default: () => [] },
    counters: { type: countersSchema, default: () => ({}) },
    // Gifts sent on the Pacific-time day in giftDay.
    giftDay: { type: String, default: '' },
    giftedToday: { type: Number, default: 0 },
});

guessPlayerSchema.index({ userID: 1, guildID: 1 }, { unique: true });
guessPlayerSchema.index({ guildID: 1, wins: -1 });
guessPlayerSchema.index({ guildID: 1, season: 1, seasonWins: -1 });

module.exports = models.GuessPlayer || model('GuessPlayer', guessPlayerSchema);
