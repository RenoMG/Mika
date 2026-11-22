const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

let mongoose;
let mongod;
let Levels;
let awardMessageXp;
let XP_COOLDOWN_MS;
let levelingHandler;
let welcomeHandler;
let commandHandler;
let loggingHandler;
let autoroleHandler;
let muteroleHandler;
let ConfigurationDB;
let evaluateCommandGates;
let levelsCommand;
let CATEGORY_DISABLED;
let CHANNEL_DISABLED;
let guildMemberAdd;
let guildMemberRemove;
let configInfoEmbeds;
let DEFAULT_LEVEL_MESSAGE;
let DEFAULT_GREETING_MESSAGE;
let DEFAULT_FAREWELL_MESSAGE;

function interactionFor(guildId, values = {}) {
    const replies = [];
    return {
        guildId,
        replies,
        options: {
            getString(name) {
                return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
            },
            getChannel(name) {
                return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
            },
            getRole(name) {
                return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
            },
            getSubcommand() {
                return values.sub || null;
            },
        },
        reply: async (payload) => {
            replies.push(payload);
            return payload;
        },
    };
}

function buildMessage({ guildId, userId, channelId = 'talk', bot = false, extraChannels = [] }) {
    const sent = [];
    const makeChannel = (id) => ({
        id,
        send: async (text) => {
            sent.push({ id, text });
            return text;
        },
    });
    const talk = makeChannel(channelId);
    const cache = new Map([[channelId, talk]]);
    for (const id of extraChannels) cache.set(id, makeChannel(id));
    return {
        sent,
        message: {
            guild: {
                id: guildId,
                channels: {
                    cache,
                    fetch: async (id) => {
                        if (cache.has(id)) return cache.get(id);
                        throw new Error('Unknown Channel');
                    },
                },
            },
            channel: talk,
            author: { id: userId, bot, username: 'Reno' },
        },
    };
}

async function enableLeveling(guildId, { channel = '', message = '', disabledChannels = [] } = {}) {
    const { getGuildConfig } = require('../src/utils/getGuildConfig');
    const data = await getGuildConfig(guildId);
    data.LevelingCommandStatus = [{ Status: 'true' }];
    data.Levelupchannel = [{ Channel: channel }];
    data.Levelupmessage = [{ Message: message }];
    data.DisabledChannels = disabledChannels.map((id) => ({ Channels: id }));
    data.markModified('LevelingCommandStatus');
    data.markModified('Levelupchannel');
    data.markModified('Levelupmessage');
    data.markModified('DisabledChannels');
    await data.save();
    return data;
}

before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoose = require('mongoose');
    mongod = await MongoMemoryServer.create();
    process.env.MIKADATABASE = mongod.getUri();
    process.env.MIKADATABASENAME = 'mika';
    await mongoose.connect(process.env.MIKADATABASE, { dbName: 'mika' });

    Levels = require('../src/levels');
    ({ awardMessageXp, XP_COOLDOWN_MS } = require('../src/events/leveling'));
    levelingHandler = require('../src/commands/configuration/handlers/leveling');
    welcomeHandler = require('../src/commands/configuration/handlers/welcome');
    commandHandler = require('../src/commands/configuration/handlers/command');
    loggingHandler = require('../src/commands/configuration/handlers/logging');
    autoroleHandler = require('../src/commands/configuration/handlers/autorole');
    muteroleHandler = require('../src/commands/configuration/handlers/muterole');
    ConfigurationDB = require('../src/Models/ConfigurationDB');
    ({ evaluateCommandGates, CATEGORY_DISABLED, CHANNEL_DISABLED } = require('../src/utils/commandGates'));
    levelsCommand = require('../src/commands/leveling/leveling');
    guildMemberAdd = require('../src/events/guildMemberAdd');
    guildMemberRemove = require('../src/events/guildMemberRemove');
    ({ configInfoEmbeds } = require('../src/commands/configuration/handlers/info'));
    ({
        DEFAULT_LEVEL_MESSAGE,
        DEFAULT_GREETING_MESSAGE,
        DEFAULT_FAREWELL_MESSAGE,
    } = require('../src/utils/formatMessage'));
}, { timeout: 180000 });

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

test('xp formula handles a jump across more than one level', async () => {
    assert.equal(Levels.levelForXp(0), 0);
    assert.equal(Levels.levelForXp(null), 0);
    assert.equal(Levels.xpFor(1), 100);
    assert.equal(Levels.xpFor(3), 900);
    for (let level = 0; level <= 15; level += 1) {
        assert.equal(Levels.levelForXp(Levels.xpFor(level)), level);
    }

    const guildId = 'formula-guild';
    const userId = 'formula-user';
    assert.equal(await Levels.appendXp(userId, guildId, 100), true);
    assert.equal(await Levels.appendXp(userId, guildId, 800), true);
    const row = await Levels.fetch(userId, guildId);
    assert.equal(row.xp, 900);
    assert.equal(row.level, 3);
});

test('a null level row can be read and then gain xp', async () => {
    const guildId = 'null-row-guild';
    const userId = 'null-row-user';
    await mongoose.model('Levels').collection.insertOne({
        userID: userId,
        guildID: guildId,
        xp: null,
        level: null,
    });

    const row = await Levels.fetch(userId, guildId, true);
    assert.equal(row.xp, 0);
    assert.equal(row.level, 0);
    assert.ok(row.position >= 1);

    assert.equal(await Levels.appendXp(userId, guildId, 100), true);
    const updated = await Levels.fetch(userId, guildId);
    assert.equal(updated.xp, 100);
    assert.equal(updated.level, 1);
});

test("a new user's first message creates xp and ignores bots and DMs", async () => {
    const guildId = 'first-guild';
    const userId = 'first-user';
    await enableLeveling(guildId);

    const dm = await awardMessageXp({ author: { id: userId, bot: false, username: 'Reno' }, guild: null }, { xp: 5, now: 1 });
    assert.equal(dm.awarded, false);
    assert.equal(dm.reason, 'dm');

    const bot = buildMessage({ guildId, userId, bot: true });
    const botResult = await awardMessageXp(bot.message, { xp: 5, now: 1 });
    assert.equal(botResult.awarded, false);
    assert.equal(botResult.reason, 'bot');

    const first = buildMessage({ guildId, userId });
    const result = await awardMessageXp(first.message, { xp: 5, now: 1 });
    assert.equal(result.awarded, true);
    assert.equal(result.leveledUp, false);
    assert.equal(result.xp, 5);
    assert.equal(first.sent.length, 0);

    const row = await Levels.fetch(userId, guildId);
    assert.equal(row.xp, 5);
    assert.equal(row.level, 0);
    assert.equal(await mongoose.model('Levels').countDocuments({ guildID: guildId }), 1);
});

test('xp gain has a per-user cooldown', async () => {
    const guildId = 'cool-guild';
    const userId = 'cool-user';
    await enableLeveling(guildId);
    const message = buildMessage({ guildId, userId }).message;

    const first = await awardMessageXp(message, { xp: 4, now: 10_000 });
    const second = await awardMessageXp(message, { xp: 4, now: 10_000 + XP_COOLDOWN_MS - 1 });
    const third = await awardMessageXp(message, { xp: 4, now: 10_000 + XP_COOLDOWN_MS });

    assert.equal(first.awarded, true);
    assert.equal(second.awarded, false);
    assert.equal(second.reason, 'cooldown');
    assert.equal(third.awarded, true);

    const row = await Levels.fetch(userId, guildId);
    assert.equal(row.xp, 8);
});

test('a level-up uses the configured channel and message and can fall back', async () => {
    const guildId = 'levelup-guild';
    const userId = 'levelup-user';
    await enableLeveling(guildId, {
        channel: 'level-room',
        message: 'GG {userd} ({user}) is now {level}',
    });

    const scene = buildMessage({ guildId, userId, extraChannels: ['level-room'] });
    const result = await awardMessageXp(scene.message, { xp: 100, now: 50_000 });
    assert.equal(result.awarded, true);
    assert.equal(result.leveledUp, true);
    assert.equal(result.previousLevel, 0);
    assert.equal(result.level, 1);
    assert.equal(result.announced, true);
    assert.equal(scene.sent.length, 1);
    assert.equal(scene.sent[0].id, 'level-room');
    assert.equal(scene.sent[0].text, 'GG Reno (<@levelup-user>) is now 1');

    const fallbackGuild = 'fallback-guild';
    await enableLeveling(fallbackGuild, { channel: 'missing-room', message: '' });
    const fallback = buildMessage({ guildId: fallbackGuild, userId: 'fallback-user' });
    const fallbackResult = await awardMessageXp(fallback.message, { xp: 100, now: 80_000 });
    assert.equal(fallbackResult.leveledUp, true);
    assert.equal(fallback.sent.length, 1);
    assert.equal(fallback.sent[0].id, 'talk');
    assert.equal(fallback.sent[0].text, '<@fallback-user> has reached level 1!');
});

test('disabled channels still block /levels and do not block xp', async () => {
    const guildId = 'disabled-guild';
    const userId = 'disabled-user';
    await enableLeveling(guildId, { disabledChannels: ['talk'] });
    const scene = buildMessage({ guildId, userId, channelId: 'talk' });
    const result = await awardMessageXp(scene.message, { xp: 6, now: 90_000 });
    assert.equal(result.awarded, true);

    const command = {
        configKey: 'LevelingCommandStatus',
        checkDisabledChannels: true,
        permissions: undefined,
    };
    const config = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(evaluateCommandGates({
        command,
        config,
        channelId: 'talk',
        memberHas: true,
        botHas: true,
    }).content, CHANNEL_DISABLED);
    config.LevelingCommandStatus = [{ Status: 'false' }];
    assert.equal(evaluateCommandGates({
        command,
        config,
        channelId: 'other',
        memberHas: true,
        botHas: true,
    }).content, CATEGORY_DISABLED);
});

test('rank works with no stored data and with an optional target', async () => {
    const guildId = 'rank-guild';
    const replies = [];
    await levelsCommand.execute({
        user: { id: 'rank-self', username: 'Reno' },
        guild: { id: guildId, name: 'Server' },
        options: {
            getSubcommand: () => 'rank',
            getUser: () => null,
        },
        reply: async (body) => replies.push(body),
    }, { users: { fetch: async () => null } });
    const self = replies[0].embeds[0].data;
    assert.equal(self.title, 'Reno');
    assert.match(self.description, /Level \*\*0\*\*/);
    assert.match(self.description, /Rank \*\*#\d+\*\*/);
    assert.match(self.description, /XP toward the next level/);

    const targeted = [];
    await levelsCommand.execute({
        user: { id: 'rank-self', username: 'Reno' },
        guild: { id: guildId, name: 'Server' },
        options: {
            getSubcommand: () => 'rank',
            getUser: (name) => (name === 'target' ? { id: 'rank-other', username: 'Sam' } : null),
        },
        reply: async (body) => targeted.push(body),
    }, { users: { fetch: async () => null } });
    const other = targeted[0].embeds[0].data;
    assert.equal(other.title, 'Sam');
    assert.match(other.description, /Level \*\*0\*\*/);
    assert.match(other.description, /Rank \*\*#\d+\*\*/);
});

test('leaderboard labels a member who cannot be fetched', async () => {
    const guildId = 'board-guild';
    await Levels.appendXp('present', guildId, 40);
    await Levels.appendXp('gone', guildId, 15);
    await Levels.appendXp('alone', 'solo-guild', 20);

    const solo = await Levels.computeLeaderboard({
        users: { fetch: async () => ({ username: 'Only', discriminator: '0' }) },
    }, await Levels.fetchLeaderboard('solo-guild', 10));
    assert.equal(solo.length, 1);
    assert.equal(solo[0].username, 'Only');

    const missing = await Levels.computeLeaderboard({
        users: { fetch: async () => null },
    }, [{ userID: 'ghost', guildID: guildId, xp: 15, level: null }]);
    assert.equal(missing[0].departed, true);
    assert.equal(missing[0].level, 0);

    const replies = [];
    await levelsCommand.execute({
        user: { id: 'present', username: 'Reno' },
        guild: { id: guildId, name: 'Server' },
        options: {
            getSubcommand: () => 'leaderboard',
            getUser: () => null,
        },
        reply: async (body) => replies.push(body),
    }, {
        users: {
            fetch: async (id) => {
                if (id === 'gone') throw new Error('Unknown User');
                return { id, username: 'Reno', discriminator: '0' };
            },
        },
    });

    const board = replies[0].embeds[0].data;
    assert.equal(board.title, 'Leaderboard for Server');
    assert.match(board.description, /👑 Reno - Level: 0 - XP: 40/);
    assert.match(board.description, /🥈 Unknown user \(left the server\) - Level: 0 - XP: 15/);
    assert.match(board.footer.text, /Showing 2 members · Page 1 \/ 1/);
    const row = replies[0].components[0].toJSON().components;
    assert.equal(row[0].label, 'Prev');
    assert.equal(row[1].label, 'Next');
    assert.equal(row[0].disabled, true);
    assert.equal(row[1].disabled, true);
    assert.equal(levelsCommand.data.toJSON().default_member_permissions, undefined);
    assert.equal(require('../src/commands/configuration/config').data.toJSON().default_member_permissions, PermissionFlagsBits.BanMembers.toString());
});

test('/config leveling with the optional options omitted does not call toString on null', async () => {
    const guildId = 'config-level-guild';
    const { getGuildConfig } = require('../src/utils/getGuildConfig');
    await getGuildConfig(guildId);

    const nothing = interactionFor(guildId, {});
    await levelingHandler(nothing);
    assert.equal(nothing.replies[0], 'Nothing was changed!');

    const statusOnly = interactionFor(guildId, { status: 'true' });
    await levelingHandler(statusOnly);
    assert.match(statusOnly.replies[0], /^Server config has been updated!/);
    assert.match(statusOnly.replies[0], /\{user\} is a mention/);
    assert.match(statusOnly.replies[0], /\{userd\} is the display name/);
    assert.match(statusOnly.replies[0], /\{level\} is the new level/);
    assert.match(statusOnly.replies[0], /Set message to default/);

    let saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.LevelingCommandStatus[0].Status, 'true');
    assert.equal(saved.Levelupchannel[0].Channel, '');
    assert.equal(saved.Levelupmessage[0].Message, '');

    const messageOnly = interactionFor(guildId, { message: 'nice {user}' });
    await levelingHandler(messageOnly);
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.LevelingCommandStatus[0].Status, 'true');
    assert.equal(saved.Levelupmessage[0].Message, 'nice {user}');
    assert.equal(saved.Levelupchannel[0].Channel, '');

    const channelOnly = interactionFor(guildId, {
        channel: {
            id: '4242',
            toString() {
                throw new TypeError("Cannot read properties of null (reading 'toString')");
            },
        },
    });
    await levelingHandler(channelOnly);
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.Levelupchannel[0].Channel, '4242');
    assert.equal(saved.Levelupmessage[0].Message, 'nice {user}');

    const oldGuild = 'config-level-old';
    await ConfigurationDB.collection.insertOne({
        GuildID: oldGuild,
        LevelingCommandStatus: null,
        Levelupchannel: null,
        Levelupmessage: null,
    });
    const old = interactionFor(oldGuild, { status: 'true' });
    await levelingHandler(old);
    assert.match(old.replies[0], /^Server config has been updated!/);
    assert.match(old.replies[0], /\{level\} is the new level/);
    const oldSaved = await ConfigurationDB.findOne({ GuildID: oldGuild });
    assert.equal(oldSaved.LevelingCommandStatus[0].Status, 'true');
    assert.equal(oldSaved.Levelupchannel, null);
    assert.equal(oldSaved.Levelupmessage, null);
});

test('other config handlers ignore omitted options instead of reading null', async () => {
    const guildId = 'config-siblings';
    const { getGuildConfig } = require('../src/utils/getGuildConfig');
    await getGuildConfig(guildId);

    const welcome = interactionFor(guildId, { greeting: 'true' });
    await welcomeHandler(welcome);
    assert.match(welcome.replies[0], /Server config has been updated!/);
    assert.match(welcome.replies[0], /\{user\} is a mention/);
    assert.match(welcome.replies[0], /\{userd\} is the display name/);

    const command = interactionFor(guildId, { moderation: 'false' });
    await commandHandler(command);
    assert.equal(command.replies[0], 'Server config has been updated!');

    const logging = interactionFor(guildId, { status: 'true' });
    await loggingHandler(logging);
    assert.equal(logging.replies[0], 'Server config has been updated!');

    const autorole = interactionFor(guildId, { status: 'true' });
    await autoroleHandler(autorole);
    assert.equal(autorole.replies[0], 'Server config has been updated!');

    const mute = interactionFor(guildId, {});
    await muteroleHandler(mute);
    assert.equal(mute.replies[0], 'Nothing was changed!');

    const saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.GreetingStatus[0].Status, 'true');
    assert.equal(saved.GreetingChannel[0].Channel, '');
    assert.equal(saved.FarewellChannel[0].Channel, '');
    assert.equal(saved.ModerationCommandStatus[0].Status, 'false');
    assert.deepEqual(saved.DisabledChannels, []);
    assert.equal(saved.LoggingStatus[0].Status, 'true');
    assert.equal(saved.LoggingChannel[0].Channel, '');
    assert.equal(saved.AutoroleStatus[0].Status, 'true');
    assert.equal(saved.AutoroleRole[0].Role, '');
});

function fieldValue(pages, description, name) {
    const page = pages.find((embed) => embed.data.description === description);
    assert.ok(page, description);
    const field = page.data.fields.find((entry) => entry.name === name);
    assert.ok(field, name);
    return field.value;
}

function memberWithChannels(guildId, userId, displayName, channelIds) {
    const sent = [];
    const cache = new Map();
    for (const id of channelIds) {
        cache.set(id, {
            id,
            send: async (text) => {
                sent.push({ id, text });
                return text;
            },
        });
    }
    return {
        sent,
        member: {
            displayName,
            user: {
                id: userId,
                username: 'reno',
                globalName: 'Reno Global',
                tag: 'reno#0',
                createdAt: new Date('2020-01-01T00:00:00Z'),
            },
            displayAvatarURL: () => 'https://example.com/a.png',
            guild: { id: guildId, channels: { cache } },
            roles: { add: async () => {} },
        },
    };
}

test('level-up {userd} is the display name, including mixed-case tokens', async () => {
    const guildId = 'nick-guild';
    const userId = 'nick-user';
    await enableLeveling(guildId, { message: '{USERD} ({user}) hit {LEVEL}' });
    const scene = buildMessage({ guildId, userId });
    scene.message.member = { displayName: 'Nick {user}' };
    scene.message.author.globalName = 'Reno Global';
    const result = await awardMessageXp(scene.message, { xp: 100, now: 120_000 });
    assert.equal(result.leveledUp, true);
    assert.equal(result.announced, true);
    assert.equal(scene.sent[0].text, 'Nick {user} (<@nick-user>) hit 1');
});

test('/config info shows defaults, and message:default restores the level-up text', async () => {
    const guildId = 'info-default-guild';
    const { getGuildConfig } = require('../src/utils/getGuildConfig');
    const fresh = await getGuildConfig(guildId);
    let pages = configInfoEmbeds(fresh);
    assert.equal(fieldValue(pages, 'Leveling config', 'Level up message'), `Default: ${DEFAULT_LEVEL_MESSAGE}`);
    assert.equal(fieldValue(pages, 'Welcome config', 'Greeting message'), DEFAULT_GREETING_MESSAGE);
    assert.equal(fieldValue(pages, 'Welcome config', 'Farewell message'), DEFAULT_FAREWELL_MESSAGE);

    const blankPages = configInfoEmbeds({
        GreetingMessage: [{ Message: '' }],
        FarewellMessage: [{ Message: '   ' }],
        Levelupmessage: [{ Message: '' }],
    });
    assert.equal(fieldValue(blankPages, 'Welcome config', 'Greeting message'), `Default: ${DEFAULT_GREETING_MESSAGE}`);
    assert.equal(fieldValue(blankPages, 'Welcome config', 'Farewell message'), `Default: ${DEFAULT_FAREWELL_MESSAGE}`);
    assert.equal(fieldValue(blankPages, 'Leveling config', 'Level up message'), `Default: ${DEFAULT_LEVEL_MESSAGE}`);

    await enableLeveling(guildId, { message: 'GG {userd} ({user}) is {level}' });
    const custom = buildMessage({ guildId, userId: 'info-user' });
    custom.message.member = { displayName: 'Reno' };
    await awardMessageXp(custom.message, { xp: 100, now: 160_000 });
    assert.equal(custom.sent[0].text, 'GG Reno (<@info-user>) is 1');

    let saved = await ConfigurationDB.findOne({ GuildID: guildId });
    pages = configInfoEmbeds(saved);
    assert.equal(fieldValue(pages, 'Leveling config', 'Level up message'), 'GG {userd} ({user}) is {level}');

    const reset = interactionFor(guildId, { message: ' Default ' });
    await levelingHandler(reset);
    assert.match(reset.replies[0], /reset to the default/);
    assert.match(reset.replies[0], /\{user\} has reached level \{level\}!/);
    assert.match(reset.replies[0], /\{user\} is a mention/);
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.Levelupmessage[0].Message, '');
    assert.equal(saved.LevelingCommandStatus[0].Status, 'true');
    pages = configInfoEmbeds(saved);
    assert.equal(fieldValue(pages, 'Leveling config', 'Level up message'), `Default: ${DEFAULT_LEVEL_MESSAGE}`);

    const again = buildMessage({ guildId, userId: 'info-user-2' });
    await awardMessageXp(again.message, { xp: 100, now: 170_000 });
    assert.equal(again.sent[0].text, '<@info-user-2> has reached level 1!');

    const kept = interactionFor(guildId, { message: 'my default message' });
    await levelingHandler(kept);
    saved = await ConfigurationDB.findOne({ GuildID: guildId });
    assert.equal(saved.Levelupmessage[0].Message, 'my default message');
    pages = configInfoEmbeds(saved);
    assert.equal(fieldValue(pages, 'Leveling config', 'Level up message'), 'my default message');
});

test('welcome and farewell replace both {user} and {userd}', async () => {
    const guildId = 'greet-guild';
    const { getGuildConfig } = require('../src/utils/getGuildConfig');
    const data = await getGuildConfig(guildId);
    data.GreetingStatus = [{ Status: 'true' }];
    data.GreetingChannel = [{ Channel: 'hello-room' }];
    data.GreetingMessage = [{ Message: 'Hi {USER} ({UserD}) {user}' }];
    data.FarewellStatus = [{ Status: 'true' }];
    data.FarewellChannel = [{ Channel: 'bye-room' }];
    data.FarewellMessage = [{ Message: 'Bye {user} / {userd}' }];
    for (const key of ['GreetingStatus', 'GreetingChannel', 'GreetingMessage', 'FarewellStatus', 'FarewellChannel', 'FarewellMessage']) {
        data.markModified(key);
    }
    await data.save();

    const scene = memberWithChannels(guildId, 'member-1', 'Nick {user}', ['hello-room', 'bye-room']);
    await guildMemberAdd.execute(scene.member);
    await guildMemberRemove.execute(scene.member);
    assert.deepEqual(scene.sent, [
        { id: 'hello-room', text: 'Hi <@member-1> (Nick {user}) <@member-1>' },
        { id: 'bye-room', text: 'Bye <@member-1> / Nick {user}' },
    ]);
});

test('a blank greeting or farewell is sent as its default', async () => {
    const guildId = 'greet-default-guild';
    const { getGuildConfig } = require('../src/utils/getGuildConfig');
    const data = await getGuildConfig(guildId);
    data.GreetingStatus = [{ Status: 'true' }];
    data.GreetingChannel = [{ Channel: 'hello-room' }];
    data.GreetingMessage = [{ Message: '' }];
    data.FarewellStatus = [{ Status: 'true' }];
    data.FarewellChannel = [{ Channel: 'bye-room' }];
    data.FarewellMessage = [{ Message: '   ' }];
    for (const key of ['GreetingStatus', 'GreetingChannel', 'GreetingMessage', 'FarewellStatus', 'FarewellChannel', 'FarewellMessage']) {
        data.markModified(key);
    }
    await data.save();

    const scene = memberWithChannels(guildId, 'member-2', 'Sam', ['hello-room', 'bye-room']);
    await guildMemberAdd.execute(scene.member);
    await guildMemberRemove.execute(scene.member);
    assert.deepEqual(scene.sent, [
        { id: 'hello-room', text: 'Welcome to the server Sam!' },
        { id: 'bye-room', text: 'Sorry to see you go Sam!' },
    ]);
});

test('a jump from 3 to 5 attaches 3 → 5 and a failed card stays text', async () => {
    const cards = require('../src/utils/cards');
    const guildId = 'jump-guild';
    const userId = 'jump-user';
    await enableLeveling(guildId, { message: '{userd} ({user}) is now {level}' });
    await Levels.appendXp(userId, guildId, 900);
    assert.equal((await Levels.fetch(userId, guildId)).level, 3);

    const scene = buildMessage({ guildId, userId });
    scene.message.member = { displayName: 'Reno' };
    scene.message.author.displayAvatarURL = () => 'https://cdn.example/avatar.png';
    const seen = [];
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const original = cards.renderLevelUpCard;
    cards.renderLevelUpCard = async (data) => {
        seen.push(data);
        return png;
    };
    try {
        const result = await awardMessageXp(scene.message, { xp: 1600, now: 500_000 });
        assert.equal(result.previousLevel, 3);
        assert.equal(result.level, 5);
        assert.equal(result.leveledUp, true);
        assert.equal(seen.length, 1);
        assert.equal(seen[0].from, 3);
        assert.equal(seen[0].to, 5);
        assert.equal(cards.levelUpLabel(seen[0].from, seen[0].to), '3 → 5');
        assert.equal(scene.sent[0].text.content, 'Reno (<@jump-user>) is now 5');
        assert.equal(scene.sent[0].text.files[0].name, 'level-up.png');
        assert.equal(scene.sent[0].text.files[0].attachment, png);
    } finally {
        cards.renderLevelUpCard = original;
    }

    const fallbackGuild = 'jump-fallback-guild';
    await enableLeveling(fallbackGuild, { message: '{user} reached {level}' });
    await Levels.appendXp('jump-fallback-user', fallbackGuild, 900);
    const fallback = buildMessage({ guildId: fallbackGuild, userId: 'jump-fallback-user' });
    fallback.message.author.displayAvatarURL = () => 'https://cdn.example/avatar.png';
    cards.renderLevelUpCard = async () => {
        throw new Error('canvas down');
    };
    try {
        const result = await awardMessageXp(fallback.message, { xp: 1600, now: 600_000 });
        assert.equal(result.previousLevel, 3);
        assert.equal(result.level, 5);
        assert.equal(fallback.sent[0].text, '<@jump-fallback-user> reached 5');
    } finally {
        cards.renderLevelUpCard = original;
    }
});

test('rank sends the png and falls back to an embed when drawing fails', async () => {
    const cards = require('../src/utils/cards');
    const original = cards.renderRankCard;
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const edited = [];
    cards.renderRankCard = async () => png;
    try {
        await levelsCommand.execute({
            deferred: false,
            user: {
                id: 'png-self',
                username: 'Reno',
                displayAvatarURL: () => 'https://cdn.example/a.png',
            },
            guild: {
                id: 'png-guild',
                name: 'Server',
                members: { cache: { get: () => ({ displayName: 'Nick' }) } },
            },
            options: { getSubcommand: () => 'rank', getUser: () => null },
            deferReply: async function deferReply() { this.deferred = true; },
            editReply: async (body) => edited.push(body),
            reply: async () => { throw new Error('rank should edit the deferred reply'); },
        }, { users: { fetch: async () => null } });
        assert.equal(edited[0].files[0].name, 'rank.png');
        assert.equal(edited[0].files[0].attachment, png);
    } finally {
        cards.renderRankCard = original;
    }

    const replies = [];
    cards.renderRankCard = async () => { throw new Error('canvas down'); };
    try {
        await levelsCommand.execute({
            user: {
                id: 'png-self',
                username: 'Reno',
                displayAvatarURL: () => 'https://cdn.example/a.png',
            },
            guild: { id: 'png-guild', name: 'Server' },
            options: { getSubcommand: () => 'rank', getUser: () => null },
            reply: async (body) => replies.push(body),
        }, { users: { fetch: async () => null } });
        assert.match(replies[0].embeds[0].data.description, /Level \*\*\d+\*\*/);
        assert.match(replies[0].embeds[0].data.description, /Rank \*\*#\d+\*\*/);
        assert.equal(replies[0].files, undefined);
    } finally {
        cards.renderRankCard = original;
    }
});

test('leaderboard pages belong to the person who ran the command', async () => {
    const guildId = 'page-guild';
    for (let index = 0; index < 11; index += 1) {
        await Levels.appendXp(`page-user-${index}`, guildId, 50 - index);
    }

    const replies = [];
    const edits = [];
    let collector;
    await levelsCommand.execute({
        user: { id: 'page-owner', username: 'Owner' },
        guild: { id: guildId, name: 'Pages' },
        options: { getSubcommand: () => 'leaderboard', getUser: () => null },
        async reply(body) {
            replies.push(body);
            return {
                resource: {
                    message: {
                        createMessageComponentCollector() {
                            const handlers = {};
                            collector = {
                                on(event, handler) {
                                    handlers[event] = handler;
                                    return collector;
                                },
                                handlers,
                            };
                            return collector;
                        },
                    },
                },
            };
        },
        editReply: async (body) => edits.push(body),
    }, {
        users: {
            fetch: async (id) => ({ id, username: id, discriminator: '0' }),
        },
    });

    const first = replies[0].embeds[0].data;
    assert.match(first.footer.text, /Showing 11 members · Page 1 \/ 2/);
    assert.match(first.description, /👑 page-user-0 - Level: 0 - XP: 50/);
    assert.doesNotMatch(first.description, /page-user-10/);
    const firstRow = replies[0].components[0].toJSON().components;
    assert.equal(firstRow[0].disabled, true);
    assert.equal(firstRow[1].disabled, false);

    const denied = [];
    await collector.handlers.collect({
        user: { id: 'someone-else' },
        customId: 'levels:leaderboard:next',
        reply: async (body) => denied.push(body),
        update: async () => { throw new Error('another person must not change the page'); },
    });
    assert.match(denied[0].content, /Only the person who used \/levels/);

    const updates = [];
    await collector.handlers.collect({
        user: { id: 'page-owner' },
        customId: 'levels:leaderboard:next',
        update: async (body) => updates.push(body),
    });
    assert.match(updates[0].embeds[0].data.description, /11 page-user-10 - Level: 0 - XP: 40/);
    assert.match(updates[0].embeds[0].data.footer.text, /Page 2 \/ 2/);
    const nextRow = updates[0].components[0].toJSON().components;
    assert.equal(nextRow[0].disabled, false);
    assert.equal(nextRow[1].disabled, true);

    await collector.handlers.end();
    const closed = edits[0].components[0].toJSON().components;
    assert.equal(closed[0].disabled, true);
    assert.equal(closed[1].disabled, true);
    assert.match(edits[0].embeds[0].data.footer.text, /Page 2 \/ 2/);
});

test('an empty leaderboard is an embed without buttons', async () => {
    const replies = [];
    await levelsCommand.execute({
        user: { id: 'empty-user', username: 'Reno' },
        guild: { id: 'empty-board-guild', name: 'Empty' },
        options: { getSubcommand: () => 'leaderboard', getUser: () => null },
        reply: async (body) => replies.push(body),
    }, { users: { fetch: async () => null } });
    assert.equal(replies[0].embeds[0].data.description, 'Leaderboard is not populated yet.');
    assert.match(replies[0].embeds[0].data.footer.text, /No ranked members yet/);
    assert.equal(replies[0].components.length, 0);
});

test('xp skips webhooks and system messages before any database write', async () => {
    const webhookGuild = 'webhook-xp-guild';
    const webhook = buildMessage({ guildId: webhookGuild, userId: 'hook-user' });
    webhook.message.author.bot = false;
    webhook.message.webhookId = 'hook-1';
    const hookResult = await awardMessageXp(webhook.message, { xp: 5, now: 1 });
    assert.equal(hookResult.awarded, false);
    assert.equal(hookResult.reason, 'webhook');

    const systemGuild = 'system-xp-guild';
    const system = buildMessage({ guildId: systemGuild, userId: 'system-user' });
    system.message.author.bot = false;
    system.message.system = true;
    const systemResult = await awardMessageXp(system.message, { xp: 5, now: 2 });
    assert.equal(systemResult.awarded, false);
    assert.equal(systemResult.reason, 'system');

    const authorGuild = 'author-system-xp-guild';
    const authorSystem = buildMessage({ guildId: authorGuild, userId: 'author-system-user' });
    authorSystem.message.author.bot = false;
    authorSystem.message.author.system = true;
    const authorResult = await awardMessageXp(authorSystem.message, { xp: 5, now: 3 });
    assert.equal(authorResult.awarded, false);
    assert.equal(authorResult.reason, 'system');

    assert.equal(await mongoose.model('Levels').countDocuments({ userID: { $in: ['hook-user', 'system-user', 'author-system-user'] } }), 0);
    assert.equal(await ConfigurationDB.countDocuments({ GuildID: { $in: [webhookGuild, systemGuild, authorGuild] } }), 0);
});

test('ranking a bot or app does not create a level row or a guild config', async () => {
    const { BOT_RANK_MESSAGE } = require('../src/utils/botAccount');
    const interactionCreate = require('../src/events/interactionCreate');
    const guildId = 'bot-gate-guild';
    const replies = [];
    let executed = false;
    const command = {
        ...levelsCommand,
        async execute() {
            executed = true;
        },
    };
    await interactionCreate.execute({
        isChatInputCommand: () => true,
        commandName: 'levels',
        guild: { id: guildId },
        channel: { id: 'talk' },
        user: { id: 'human', username: 'Reno' },
        options: {
            getSubcommand: () => 'rank',
            getUser: (name) => (name === 'target'
                ? { id: 'mika-bot', username: 'Mika', bot: true, discriminator: '0420' }
                : null),
        },
        reply: async (body) => {
            replies.push(body);
        },
    }, { commands: { get: (name) => (name === 'levels' ? command : undefined) } });

    assert.equal(executed, false);
    assert.equal(replies[0].flags, MessageFlags.Ephemeral);
    assert.equal(replies[0].content, BOT_RANK_MESSAGE);
    assert.equal(await mongoose.model('Levels').countDocuments({ userID: 'mika-bot' }), 0);
    assert.equal(await ConfigurationDB.countDocuments({ GuildID: guildId }), 0);

    const direct = [];
    await levelsCommand.execute({
        user: { id: 'human', username: 'Reno' },
        guild: { id: guildId, name: 'Server' },
        options: {
            getSubcommand: () => 'rank',
            getUser: () => ({ id: 'app-user', username: 'App', bot: true, system: false }),
        },
        deferReply: async () => {
            throw new Error('rank must not defer for a bot');
        },
        reply: async (body) => direct.push(body),
    }, { users: { fetch: async () => { throw new Error('rank must not fetch a bot'); } } });
    assert.equal(direct[0].content, BOT_RANK_MESSAGE);
    assert.equal(direct[0].flags, MessageFlags.Ephemeral);
    assert.equal(await mongoose.model('Levels').countDocuments({ userID: 'app-user' }), 0);

    const systemReplies = [];
    await levelsCommand.execute({
        user: { id: 'human', username: 'Reno' },
        guild: { id: guildId, name: 'Server' },
        options: {
            getSubcommand: () => 'rank',
            getUser: () => ({ id: 'discord-system', username: 'System', bot: false, system: true }),
        },
        deferReply: async () => {
            throw new Error('rank must not defer for a system user');
        },
        reply: async (body) => systemReplies.push(body),
    }, { users: { fetch: async () => { throw new Error('rank must not fetch a system user'); } } });
    assert.equal(systemReplies[0].content, BOT_RANK_MESSAGE);
    assert.equal(await mongoose.model('Levels').countDocuments({ userID: 'discord-system' }), 0);
});

test('bots do not take top-50 leaderboard slots, and a human rank ignores them', async () => {
    const guildId = 'bot-board-guild';
    for (let index = 0; index < 50; index += 1) {
        await Levels.appendXp(`slot-bot-${index}`, guildId, 1000 - index);
    }
    await Levels.appendXp('slot-human', guildId, 1);
    await Levels.appendXp('known-bot', guildId, 2000);

    const replies = [];
    await levelsCommand.execute({
        user: { id: 'slot-human', username: 'Reno', discriminator: '0' },
        guild: { id: guildId, name: 'Server' },
        options: { getSubcommand: () => 'leaderboard', getUser: () => null },
        reply: async (body) => replies.push(body),
    }, {
        user: { id: 'known-bot' },
        users: {
            fetch: async (id) => {
                if (id === 'known-bot') throw new Error('Unknown User');
                if (String(id).startsWith('slot-bot-')) {
                    return { id, username: 'Mika', discriminator: '1234', bot: true };
                }
                return { id, username: 'Reno', discriminator: '0', bot: false };
            },
        },
    });

    const description = replies[0].embeds[0].data.description;
    assert.match(description, /👑 Reno - Level: 0 - XP: 1/);
    assert.doesNotMatch(description, /Mika/);
    assert.doesNotMatch(description, /#1234/);
    assert.match(replies[0].embeds[0].data.footer.text, /Showing 1 member/);

    const rankReplies = [];
    await levelsCommand.execute({
        user: { id: 'someone', username: 'Someone' },
        guild: {
            id: guildId,
            name: 'Server',
            members: { cache: { get: () => null } },
        },
        options: {
            getSubcommand: () => 'rank',
            getUser: () => ({ id: 'slot-human', username: 'Reno', discriminator: '0', bot: false }),
        },
        reply: async (body) => rankReplies.push(body),
    }, {
        user: { id: 'known-bot' },
        users: {
            fetch: async (id) => {
                if (id === 'known-bot') throw new Error('Unknown User');
                if (String(id).startsWith('slot-bot-')) {
                    return { id, username: 'Mika', discriminator: '1234', bot: true };
                }
                return { id, username: 'Reno', discriminator: '0', bot: false };
            },
        },
    });
    assert.equal(rankReplies[0].embeds[0].data.title, 'Reno');
    assert.match(rankReplies[0].embeds[0].data.description, /Rank \*\*#1\*\*/);
    assert.doesNotMatch(JSON.stringify(rankReplies[0].embeds[0].data), /#1234/);
});

test('bot level cleanup deletes only users Discord marks as bots', async () => {
    const { removeBotLevelDocs } = require('../src/utils/removeBotLevels');
    const Level = mongoose.model('Levels');
    await Level.create({ userID: 'keep-human', guildID: 'clean-guild', xp: 10, level: 0 });
    await Level.create({ userID: 'keep-human', guildID: 'clean-guild-2', xp: 4, level: 0 });
    await Level.create({ userID: 'keep-gone', guildID: 'clean-guild', xp: 8, level: 0 });
    await Level.create({ userID: 'drop-bot', guildID: 'clean-guild', xp: 90, level: 0 });
    await Level.create({ userID: 'drop-bot', guildID: 'clean-guild-2', xp: 3, level: 0 });
    await Level.create({ userID: 'keep-unfetched', guildID: 'clean-guild', xp: 2, level: 0 });

    const client = {
        users: {
            fetch: async (id) => {
                if (id === 'keep-gone' || id === 'keep-unfetched') throw new Error('Unknown User');
                if (id === 'drop-bot') return { id, bot: true, username: 'Mika' };
                if (id === 'keep-human') return { id, bot: false, username: 'Reno' };
                throw new Error(`leave ${id}`);
            },
        },
    };

    const preview = await removeBotLevelDocs(client);
    assert.equal(preview.dryRun, true);
    assert.equal(preview.deleted, 0);
    assert.equal(preview.bots, 1);
    assert.equal(preview.documents, 2);
    assert.deepEqual(preview.ids, ['drop-bot']);
    assert.equal(await Level.countDocuments({ userID: 'drop-bot' }), 2);

    const applied = await removeBotLevelDocs(client, { dryRun: false });
    assert.equal(applied.deleted, 2);
    assert.equal(await Level.countDocuments({ userID: 'drop-bot' }), 0);
    assert.equal(await Level.countDocuments({ userID: 'keep-human' }), 2);
    assert.equal(await Level.countDocuments({ userID: 'keep-gone' }), 1);
    assert.equal(await Level.countDocuments({ userID: 'keep-unfetched' }), 1);

    const again = await removeBotLevelDocs(client, { dryRun: false });
    assert.equal(again.deleted, 0);
    assert.equal(again.bots, 0);
    assert.equal(await Level.countDocuments({ userID: 'keep-human' }), 2);
});
