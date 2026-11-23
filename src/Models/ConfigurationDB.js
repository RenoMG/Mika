const { Schema, model } = require('mongoose');

// Same shapes guildCreate used to insert. Factories so documents do not share array instances.
const commandStatus = (status) => () => [{ Status: status }];
const textList = (key, value) => () => [{ [key]: value }];

const configurationSchema = new Schema({
    GuildID: String,
    ModerationCommandStatus: { type: Array, default: commandStatus('true') },
    MemeCommandStatus: { type: Array, default: commandStatus('true') },
    InfoCommandStatus: { type: Array, default: commandStatus('true') },
    DisabledChannels: { type: Array, default: () => [] },
    GreetingMessage: { type: Array, default: textList('Message', 'Welcome to the server {userd}!') },
    GreetingChannel: { type: Array, default: textList('Channel', '') },
    GreetingStatus: { type: Array, default: commandStatus('false') },
    FarewellMessage: { type: Array, default: textList('Message', 'Sorry to see you go {userd}!') },
    FarewellChannel: { type: Array, default: textList('Channel', '') },
    FarewellStatus: { type: Array, default: commandStatus('false') },
    LoggingChannel: { type: Array, default: textList('Channel', '') },
    LoggingStatus: { type: Array, default: commandStatus('false') },
    AutoroleStatus: { type: Array, default: commandStatus('false') },
    AutoroleRole: { type: Array, default: textList('Role', '') },
    Muterole: { type: Array, default: textList('Role', '') },
    LevelingCommandStatus: { type: Array, default: commandStatus('false') },
    Levelupmessage: { type: Array, default: textList('Message', '') },
    Levelupchannel: { type: Array, default: textList('Channel', '') },
    GuessStatus: { type: Array, default: commandStatus('false') },
    GuessChannel: { type: Array, default: textList('Channel', '') },
    GuessInterval: { type: Array, default: textList('Minutes', '10') },
});

function guildConfigInsert(guildId) {
    return {
        GuildID: guildId,
        ModerationCommandStatus: [{ Status: 'true' }],
        MemeCommandStatus: [{ Status: 'true' }],
        InfoCommandStatus: [{ Status: 'true' }],
        DisabledChannels: [],
        GreetingMessage: [{ Message: 'Welcome to the server {userd}!' }],
        GreetingChannel: [{ Channel: '' }],
        GreetingStatus: [{ Status: 'false' }],
        FarewellMessage: [{ Message: 'Sorry to see you go {userd}!' }],
        FarewellChannel: [{ Channel: '' }],
        FarewellStatus: [{ Status: 'false' }],
        LoggingChannel: [{ Channel: '' }],
        LoggingStatus: [{ Status: 'false' }],
        AutoroleStatus: [{ Status: 'false' }],
        AutoroleRole: [{ Role: '' }],
        Muterole: [{ Role: '' }],
        LevelingCommandStatus: [{ Status: 'false' }],
        Levelupmessage: [{ Message: '' }],
        Levelupchannel: [{ Channel: '' }],
        GuessStatus: [{ Status: 'false' }],
        GuessChannel: [{ Channel: '' }],
        GuessInterval: [{ Minutes: '10' }],
    };
}

const ConfigurationDB = model('ConfigurationDB', configurationSchema);
ConfigurationDB.guildConfigInsert = guildConfigInsert;

module.exports = ConfigurationDB;
