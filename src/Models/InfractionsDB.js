const { Schema, model } = require('mongoose');

module.exports = model("InfractionsDB", new Schema({
    GuildID: String,
    UserID: String,
    UserTag: String,
    Warns: Array,
    Mutes: Array,
    Kicks: Array,
    Bans: Array
}))