const { Schema, model, models } = require('mongoose');

// Wins and crystals belong to one Discord user in one server. Crystals stay
// on the document so a later shop can spend them. The leaderboard sorts by wins.
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
});

guessPlayerSchema.index({ userID: 1, guildID: 1 }, { unique: true });
guessPlayerSchema.index({ guildID: 1, wins: -1 });

module.exports = models.GuessPlayer || model('GuessPlayer', guessPlayerSchema);
