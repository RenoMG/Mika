const { Schema, model, models } = require('mongoose');

// Recent anime and screenshots already shown, capped in the writer.
const shownSchema = new Schema({
    animeId: { type: String },
    urls: { type: [String], default: () => [] },
}, { _id: false });

const guessGuildSchema = new Schema({
    guildID: { type: String, required: true, unique: true },
    recentIds: { type: [String], default: () => [] },
    recentFranchises: { type: [require('./GuessHistory')], default: () => [] },
    shown: { type: [shownSchema], default: () => [] },
    // Character rounds shown recently, newest first, capped in the writer.
    recentCharacters: { type: [String], default: () => [] },
    // The season this server last closed out. Titles are handed out once per season.
    season: { type: String, default: '' },
});

module.exports = models.GuessGuild || model('GuessGuild', guessGuildSchema);
