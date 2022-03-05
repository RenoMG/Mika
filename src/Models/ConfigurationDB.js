const { Schema, model } = require('mongoose');

module.exports = model("ConfigurationDB", new Schema({
    GuildID: String,
    CommandStatus: Array,
    GreetingMessage: Array,
    GreetingChannel: Array,
    GreetingStatus: Array,
    FarewellMessage: Array,
    FarewellChannel: Array,
    FarewellStatus: Array,
    LoggingStatus: Array
}))