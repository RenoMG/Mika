const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');
const { MessageFlags } = require('discord.js');

let mongod;
let mongoose;
let AnimeProfile;
let AnimeFollow;
let planning;
let animelist;
let customlist;
let favorite;
let feedCommand;
let importCommand;
let settings;
let watching;

const OWNER = '100000000000000001';
const FRIEND = '100000000000000002';
const STRANGER = '100000000000000003';
const GUILD = '400000000000000001';

before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoose = require('mongoose');
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongod.getUri());
    AnimeProfile = require('../src/Models/AnimeProfile');
    AnimeFollow = require('../src/Models/AnimeFollow');
    await AnimeProfile.createIndexes();
    await AnimeFollow.createIndexes();
    planning = require('../src/commands/anime/planning');
    animelist = require('../src/commands/anime/animelist');
    customlist = require('../src/commands/anime/customlist');
    favorite = require('../src/commands/anime/favorite');
    feedCommand = require('../src/commands/anime/feed');
    importCommand = require('../src/commands/anime/import');
    settings = require('../src/commands/anime/settings');
    watching = require('../src/commands/anime/watching');
});

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

beforeEach(async () => {
    await AnimeProfile.deleteMany({});
    await AnimeFollow.deleteMany({});
    await AnimeProfile.create({ userId: OWNER, nameLabel: 'Reno' });
});

function user(id, name = 'reno') {
    return { id, username: name, globalName: name, displayAvatarURL: () => 'https://cdn.example/a.png' };
}

function interaction({ sub, group = null, strings = {}, ints = {}, numbers = {}, bools = {}, users = {}, members = {}, userId = OWNER }) {
    const sent = [];
    return {
        sent,
        id: `i-${Math.random()}`,
        createdTimestamp: Date.now(),
        deferred: false,
        replied: false,
        ephemeral: false,
        guildId: GUILD,
        guild: { id: GUILD, members: { cache: new Map() } },
        user: user(userId),
        member: { id: userId },
        client: null,
        options: {
            getSubcommand: () => sub,
            getSubcommandGroup: () => group,
            getString: (name) => (name in strings ? strings[name] : null),
            getInteger: (name) => (name in ints ? ints[name] : null),
            getNumber: (name) => (name in numbers ? numbers[name] : null),
            getBoolean: (name) => (name in bools ? bools[name] : null),
            getUser: (name) => users[name] || null,
            getMember: (name) => members[name] || null,
        },
        async deferReply(payload) {
            this.deferred = true;
            this.ephemeral = Boolean(payload && payload.flags);
        },
        async editReply(payload) { sent.push({ ...payload, ephemeral: this.ephemeral }); return payload; },
        async reply(payload) { this.replied = true; sent.push(payload); return payload; },
        async followUp(payload) { sent.push(payload); return payload; },
        async deleteReply() {},
        async fetchReply() { return null; },
    };
}

function text(payload) {
    if (payload.content) return payload.content;
    const embed = payload.embeds && payload.embeds[0];
    const json = embed && typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
    return JSON.stringify(json || {});
}

const SHOW = { id: '154587', titles: { english: 'Frieren' }, episodes: 28, duration: 24, genres: ['Adventure'], format: 'TV' };

test('plan, start, log progress, score, and finish through the commands', async () => {
    const resolveAnime = async (id) => (id === SHOW.id ? SHOW : null);
    let run = interaction({ sub: 'add', strings: { anime: SHOW.id } });
    await planning.execute(run, null, { resolveAnime });
    assert.match(text(run.sent[0]), /Added \*\*Frieren\*\* to your plan-to-watch list/);
    assert.equal(run.ephemeral, true);

    run = interaction({ sub: 'start', strings: { anime: SHOW.id } });
    await planning.execute(run, null, {});
    assert.match(text(run.sent[0]), /Started \*\*Frieren\*\*/);

    run = interaction({ sub: 'progress', strings: { anime: SHOW.id } });
    await watching.execute(run, null, {});
    assert.match(text(run.sent[0]), /Frieren\*\* · 1\/28/);
    run = interaction({ sub: 'progress', strings: { anime: SHOW.id }, ints: { episode: 10 } });
    await watching.execute(run, null, {});
    assert.match(text(run.sent[0]), /10\/28/);

    run = interaction({ sub: 'edit', strings: { anime: SHOW.id, notes: 'so good <@123456789012345678>', started: '2024-02' }, numbers: { score: 9.5 } });
    await animelist.execute(run, null, {});
    assert.match(text(run.sent[0]), /Updated \*\*Frieren\*\* · 📺 Watching · 10\/28 · ★9\.5/);
    run = interaction({ sub: 'edit', strings: { anime: SHOW.id, started: 'last week' } });
    await animelist.execute(run, null, {});
    assert.match(text(run.sent[0]), /Dates look like/);

    run = interaction({ sub: 'edit', strings: { anime: SHOW.id }, ints: { progress: 28 } });
    await animelist.execute(run, null, {});
    assert.match(text(run.sent[0]), /moved to completed/);
    const saved = await AnimeProfile.findOne({ userId: OWNER });
    assert.equal(saved.watchingList.length, 0);
    assert.equal(saved.completedList[0].score, 9.5);
    assert.equal(saved.completedList[0].notes, 'so good user');
    assert.equal(saved.completedList[0].startedAt.toISOString(), '2024-02-01T00:00:00.000Z');

    run = interaction({ sub: 'set', strings: { anime: SHOW.id, status: 'rewatching' } });
    await animelist.execute(run, null, {});
    assert.match(text(run.sent[0]), /Rewatching \*\*Frieren\*\*/);
    run = interaction({ sub: 'set', strings: { anime: SHOW.id, status: 'rewatching' } });
    await animelist.execute(run, null, {});
    assert.match(text(run.sent[0]), /already on your rewatching list/);
    run = interaction({ sub: 'set', strings: { anime: SHOW.id, status: 'hacked' } });
    await animelist.execute(run, null, {});
    assert.match(text(run.sent[0]), /Pick one of the listed statuses/);
});

test('stats and entries are public and hide notes from other people', async () => {
    await AnimeProfile.updateOne({ userId: OWNER }, { $set: { completedList: [{ anilistId: '1', title: 'Bebop', score: 9, notes: 'secret', episodes: 26, progress: 26, completedAt: new Date('2024-01-01') }] } });
    await AnimeProfile.create({ userId: FRIEND, nameLabel: 'Friend' });
    let run = interaction({ sub: 'stats' });
    await animelist.execute(run, null, {});
    assert.equal(run.ephemeral, false);
    assert.match(text(run.sent[0]), /anime stats/);

    run = interaction({ sub: 'entry', strings: { anime: '1' } });
    await animelist.execute(run, null, {});
    assert.match(text(run.sent[0]), /secret/);

    run = interaction({ sub: 'entry', strings: { anime: '1' }, userId: FRIEND, users: { user: user(OWNER) }, members: { user: { id: OWNER } } });
    await animelist.execute(run, null, {});
    assert.equal(text(run.sent[0]).includes('secret'), false, 'notes stay with their owner');
    assert.match(text(run.sent[0]), /Bebop/);

    run = interaction({ sub: 'stats', userId: FRIEND, users: { user: user(STRANGER) } });
    await animelist.execute(run, null, {});
    assert.equal(run.sent[0].flags, MessageFlags.Ephemeral, 'a profile the viewer cannot see stays hidden');
});

test('custom lists and favorite characters work end to end', async () => {
    let run = interaction({ sub: 'create', strings: { name: 'Comfort' } });
    await customlist.execute(run, null, {});
    assert.match(text(run.sent[0]), /Made \*\*Comfort\*\*/);
    run = interaction({ sub: 'add', strings: { list: 'Comfort', anime: SHOW.id } });
    await customlist.execute(run, null, { resolveAnime: async () => SHOW });
    assert.match(text(run.sent[0]), /Added \*\*Frieren\*\* to \*\*Comfort\*\* \(1\/100\)/);
    run = interaction({ sub: 'add', strings: { list: 'Nope', anime: SHOW.id } });
    await customlist.execute(run, null, { resolveAnime: async () => SHOW });
    assert.match(text(run.sent[0]), /no list with that name/);

    run = interaction({ group: 'character', sub: 'add', strings: { name: '40|Spike <@&123456789012345678>' } });
    await favorite.execute(run, null, {});
    assert.match(text(run.sent[0]), /Added \*\*Spike role\*\*/);
    run = interaction({ group: 'character', sub: 'add', strings: { name: 'typed text without a pick' } });
    await favorite.execute(run, null, {});
    assert.match(text(run.sent[0]), /Pick a character from the list/);
    const saved = await AnimeProfile.findOne({ userId: OWNER });
    assert.deepEqual(saved.favoriteCharacters.map((item) => ({ id: item.id, name: item.name })), [{ id: '40', name: 'Spike role' }]);
});

test('follows need an opted-in, visible profile, and turning followers off clears them', async () => {
    await AnimeProfile.create({ userId: FRIEND, nameLabel: 'Friend' });
    const target = { user: user(OWNER) };
    let run = interaction({ sub: 'follow', userId: FRIEND, users: target, members: { user: { id: OWNER } } });
    await feedCommand.execute(run, null, {});
    assert.match(text(run.sent[0]), /hasn't turned on followers/);

    await settings.execute(interaction({ sub: null, bools: { follows: true, activity: true } }), null, {});
    run = interaction({ sub: 'follow', userId: FRIEND, users: target, members: { user: { id: OWNER } } });
    await feedCommand.execute(run, null, {});
    assert.match(text(run.sent[0]), /Following \*\*reno\*\*/);
    assert.equal(await AnimeFollow.countDocuments({ followerId: FRIEND, targetId: OWNER }), 1);

    run = interaction({ sub: 'follow', userId: STRANGER, users: target });
    await AnimeProfile.create({ userId: STRANGER });
    await feedCommand.execute(run, null, {});
    assert.equal(await AnimeFollow.countDocuments({ followerId: STRANGER }), 0, 'no shared server and a Local profile: no follow');

    run = interaction({ sub: 'following', userId: FRIEND });
    await feedCommand.execute(run, null, {});
    assert.match(text(run.sent[0]), /You follow 1\//);

    await settings.execute(interaction({ sub: null, bools: { follows: false } }), null, {});
    assert.equal(await AnimeFollow.countDocuments({ targetId: OWNER }), 0);
});

test('import starts with a private code and its button only works for its owner', async () => {
    const run = interaction({ sub: 'anilist', strings: { username: 'RenoTest' } });
    await importCommand.execute(run, null, {});
    assert.equal(run.ephemeral, true);
    assert.match(text(run.sent[0]), /mika-[A-Z2-9]{8}/);
    const button = run.sent[0].components[0].toJSON().components[0];
    assert.equal(button.custom_id, `import:v:${OWNER}`);

    const bad = interaction({ sub: 'anilist', strings: { username: '"); drop' } });
    await importCommand.execute(bad, null, {});
    assert.match(text(bad.sent[0]), /does not look right/);

    const replies = [];
    await importCommand.handleImportButton({
        customId: `import:v:${OWNER}`,
        user: { id: FRIEND },
        reply: async (payload) => replies.push(payload),
    });
    assert.match(replies[0].content, /belongs to someone else/);
    assert.equal(importCommand.isImportButton('import:v:12'), false);
});

test('adding a show that is on another list moves it instead of duplicating it', async () => {
    const resolveAnime = async () => SHOW;
    let run = interaction({ sub: 'add', strings: { anime: SHOW.id } });
    await planning.execute(run, null, { resolveAnime });
    run = interaction({ sub: 'add', strings: { anime: SHOW.id } });
    await watching.execute(run, null, { resolveAnime });
    assert.match(text(run.sent[0]), /Moved \*\*Frieren\*\* from planning to your watching list/);
    let saved = await AnimeProfile.findOne({ userId: OWNER });
    assert.equal(saved.planningList.length, 0);
    assert.equal(saved.watchingList.length, 1);

    await animelist.execute(interaction({ sub: 'set', strings: { anime: SHOW.id, status: 'paused' } }), null, {});
    run = interaction({ sub: 'add', strings: { anime: SHOW.id } });
    await require('../src/commands/anime/completed').execute(run, null, { resolveAnime });
    assert.match(text(run.sent[0]), /took it off your paused list/);
    saved = await AnimeProfile.findOne({ userId: OWNER });
    assert.equal(saved.pausedList.length, 0);
    assert.equal(saved.completedList.length, 1);
    assert.equal(saved.completedList[0].progress, 28);
});
