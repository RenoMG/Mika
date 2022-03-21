const { Schema, model } = require('mongoose');

module.exports = model("ConfigurationDB", new Schema({
    GuildID: String,
    ImageCommandStatus: Array,
    ModerationCommandStatus: Array,
    MemeCommandStatus: Array,
    SocialCommandStatus: Array,
    InfoCommandStatus: Array,
    DisabledChannels: Array,
    GreetingMessage: Array,
    GreetingChannel: Array,
    GreetingStatus: Array,
    FarewellMessage: Array,
    FarewellChannel: Array,
    FarewellStatus: Array,
    LoggingChannel: Array,
    LoggingStatus: Array,
    AutoroleStatus: Array,
    AutoroleRole: Array,
    Muterole: Array,
    LevelingCommandStatus: Array,
    Levelupmessage: Array,
    Levelupchannel: Array
}))