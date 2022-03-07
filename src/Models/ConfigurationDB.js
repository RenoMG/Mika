const { Schema, model } = require('mongoose');

module.exports = model("ConfigurationDB", new Schema({
    GuildID: String,
    ImageCommandStatus: Array,
    ModerationCommandStatus: Array,
    RedditCommandStatus: Array,
    SocialCommandStatus: Array,
    InfoCommandStatus: Array,
    DisabledChannels: Array,
    GreetingMessage: Array,
    GreetingChannel: Array,
    GreetingStatus: Array,
    FarewellMessage: Array,
    FarewellChannel: Array,
    FarewellStatus: Array,
    LoggingStatus: Array
}))