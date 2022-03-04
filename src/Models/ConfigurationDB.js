const { Schema, model } = require('mongoose');

module.exports = model("ConfigurationDB", new Schema({
    GuildID: String,
    CommandStatus: Array,
    Greeting: Array,
    Farewell: Array,
    LoggingStatus: Array
}))