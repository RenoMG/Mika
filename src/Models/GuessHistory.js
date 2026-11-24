const { Schema } = require('mongoose');

module.exports = new Schema({
    animeId: { type: String, required: true },
    relatedIds: { type: [String], default: () => [] },
}, { _id: false });
