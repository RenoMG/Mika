const { Schema, model } = require('mongoose');

const arrayField = () => ({ type: Array, default: () => [] });
const ARRAY_KEYS = ['Warns', 'Mutes', 'Kicks', 'Bans'];

const infractionSchema = new Schema({
    GuildID: String,
    UserID: String,
    UserTag: String,
    Warns: arrayField(),
    Mutes: arrayField(),
    Kicks: arrayField(),
    Bans: arrayField(),
});

// Documents created before these defaults can omit an array. Reads call .map on them.
infractionSchema.index({ GuildID: 1, UserID: 1 }, { unique: true });
infractionSchema.set('optimisticConcurrency', true);
infractionSchema.post('init', function fillMissingInfractionArrays() {
    for (const key of ARRAY_KEYS) {
        if (!Array.isArray(this[key])) this[key] = [];
    }
});

const InfractionsDB = model('InfractionsDB', infractionSchema);
InfractionsDB.arrayKeys = ARRAY_KEYS;

module.exports = InfractionsDB;
