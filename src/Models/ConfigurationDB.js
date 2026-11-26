const { Schema, model } = require('mongoose');
const { DEFAULT_SOURCE_IDS } = require('../news/sources');

// Same shapes guildCreate used to insert. Factories so documents do not share array instances.
const commandStatus = (status) => () => [{ Status: status }];
const textList = (key, value) => () => [{ [key]: value }];
const entry = (key) => [new Schema({ [key]: String }, { _id: false })];

const configurationSchema = new Schema({
    GuildID: String,
    ModerationCommandStatus: { type: entry('Status'), default: commandStatus('true') },
    MemeCommandStatus: { type: entry('Status'), default: commandStatus('true') },
    InfoCommandStatus: { type: entry('Status'), default: commandStatus('true') },
    AnimeCommandStatus: { type: entry('Status'), default: commandStatus('true') },
    GuessCommandStatus: { type: entry('Status'), default: commandStatus('true') },
    DisabledChannels: { type: entry('Channels'), default: () => [] },
    GreetingMessage: { type: entry('Message'), default: textList('Message', 'Welcome to the server {userd}!') },
    GreetingChannel: { type: entry('Channel'), default: textList('Channel', '') },
    GreetingStatus: { type: entry('Status'), default: commandStatus('false') },
    FarewellMessage: { type: entry('Message'), default: textList('Message', 'Sorry to see you go {userd}!') },
    FarewellChannel: { type: entry('Channel'), default: textList('Channel', '') },
    FarewellStatus: { type: entry('Status'), default: commandStatus('false') },
    LoggingChannel: { type: entry('Channel'), default: textList('Channel', '') },
    LoggingStatus: { type: entry('Status'), default: commandStatus('false') },
    AutoroleStatus: { type: entry('Status'), default: commandStatus('false') },
    AutoroleRole: { type: entry('Role'), default: textList('Role', '') },
    Muterole: { type: entry('Role'), default: textList('Role', '') },
    LevelingCommandStatus: { type: entry('Status'), default: commandStatus('false') },
    Levelupmessage: { type: entry('Message'), default: textList('Message', '') },
    Levelupchannel: { type: entry('Channel'), default: textList('Channel', '') },
    GuessStatus: { type: entry('Status'), default: commandStatus('false') },
    GuessChannel: { type: entry('Channel'), default: textList('Channel', '') },
    GuessInterval: { type: entry('Minutes'), default: textList('Minutes', '10') },
    // Blog Watcher. A blank feed or message means the built-in one (src/blog/settings.js).
    BlogStatus: { type: entry('Status'), default: commandStatus('false') },
    BlogChannel: { type: entry('Channel'), default: textList('Channel', '') },
    BlogFeed: { type: entry('URL'), default: textList('URL', '') },
    BlogMessage: { type: entry('Message'), default: textList('Message', '') },
    BlogRole: { type: entry('Role'), default: textList('Role', '') },
    // Anime News. A blank message means the built-in one; the site list starts on
    // the default sites (src/news/sources.js). See src/news/settings.js.
    NewsStatus: { type: entry('Status'), default: commandStatus('false') },
    NewsChannel: { type: entry('Channel'), default: textList('Channel', '') },
    NewsMessage: { type: entry('Message'), default: textList('Message', '') },
    NewsRole: { type: entry('Role'), default: textList('Role', '') },
    NewsSources: { type: entry('Source'), default: () => DEFAULT_SOURCE_IDS.map((id) => ({ Source: id })) },
});

configurationSchema.set('optimisticConcurrency', true);
configurationSchema.index({ GuildID: 1 }, { unique: true });
configurationSchema.post('save', function(doc) {
    require('../utils/getGuildConfig').invalidateGuildConfig(doc.GuildID);
});
function guildConfigInsert(guildId) {
    const values = new ConfigurationDB({ GuildID: guildId }).toObject();
    delete values._id;
    delete values.__v;
    return values;
}

const ConfigurationDB = model('ConfigurationDB', configurationSchema);
ConfigurationDB.guildConfigInsert = guildConfigInsert;

module.exports = ConfigurationDB;
