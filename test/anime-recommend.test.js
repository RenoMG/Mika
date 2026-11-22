const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const SENDER = '100000000000000001';
const TARGET = '100000000000000002';
const OTHER = '100000000000000003';
const HIDDEN_USER = '100000000000000004';
const NOW = Date.parse('2026-06-01T12:00:00.000Z');

let mongoose;
let mongod;
let AnimeProfile;
let PendingRecommendation;
let RecommendGuard;
let deliverRecommend;
let checkRecommend;
let handleRecommendButton;
let interactionCreate;
let profileForViewer;
let searchProfiles;
let deleteProfile;
let HIDDEN;
let SETUP_FIRST;
let setupCommand;
let bioCommand;
let COOLDOWN_MS;
let DAILY_CAP;
let SELF;
let BOT;
let NO_PROFILE;
let RECS_OFF;
let DUPLICATE;
let COOLDOWN;
let DAILY;
let DM_CLOSED;
let SENT;

const media = {
    id: '1',
    source: 'AniList',
    url: 'https://anilist.co/anime/1',
    cover: 'https://cdn.example/cover.jpg',
    titles: { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', native: '' },
    synopsis: 'Jazz.',
    episodes: 26,
    status: 'FINISHED',
    score: 86,
    genres: ['Action'],
    tags: ['Space'],
    studios: ['Sunrise'],
    startDate: { year: 1998, month: 4, day: 3 },
    endDate: null,
};

function base(extra = {}) {
    return {
        senderId: SENDER,
        targetId: TARGET,
        senderName: '@everyone',
        anilist: '1',
        inGuild: true,
        targetIsBot: false,
        guildId: '100000000000000010',
        media,
        now: NOW,
        send: async () => {},
        ...extra,
    };
}

async function reset() {
    await AnimeProfile.deleteMany({});
    await PendingRecommendation.deleteMany({});
    await RecommendGuard.deleteMany({});
}

async function allow(userId, extra = {}) {
    await AnimeProfile.create({
        userId,
        discoverable: false,
        recommendations: true,
        bio: '',
        watching: '',
        favoriteId: '',
        favoriteTitle: '',
        genres: [],
        accepted: [],
        ...extra,
    });
}

before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoose = require('mongoose');
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'mika' });
    AnimeProfile = require('../src/Models/AnimeProfile');
    ({ PendingRecommendation, RecommendGuard } = require('../src/Models/AnimeRecommend'));
    ({
        COOLDOWN_MS,
        DAILY_CAP,
        SELF,
        BOT,
        NO_PROFILE,
        RECS_OFF,
        DUPLICATE,
        COOLDOWN,
        DAILY,
        DM_CLOSED,
        SENT,
        deliverRecommend,
        checkRecommend,
        handleRecommendButton,
    } = require('../src/anime/recommend'));
    ({
        HIDDEN,
        SETUP_FIRST,
        profileForViewer,
        searchProfiles,
        deleteProfile,
    } = require('../src/anime/profiles'));
    interactionCreate = require('../src/events/interactionCreate');
    setupCommand = require('../src/commands/anime/setup');
    bioCommand = require('../src/commands/anime/bio');
}, { timeout: 180000 });

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

test('recommend rules reject self, bots, missing profiles, and closed recommendations', async () => {
    await reset();
    assert.equal((await deliverRecommend(base({ targetId: SENDER }))).message, SELF);
    assert.equal((await deliverRecommend(base({ targetIsBot: true }))).message, BOT);
    assert.equal((await deliverRecommend(base())).message, NO_PROFILE);
    await allow(TARGET, { recommendations: false });
    assert.equal((await deliverRecommend(base())).message, RECS_OFF);
    assert.equal(await PendingRecommendation.countDocuments(), 0);
    assert.equal(await RecommendGuard.countDocuments(), 0);
});

test('duplicate pending, cooldown, and the daily cap block a send', async () => {
    await reset();
    await allow(TARGET);
    await PendingRecommendation.create({
        publicId: 'a'.repeat(16),
        senderId: SENDER,
        targetId: TARGET,
        guildId: '100000000000000010',
        anilistId: '1',
        title: 'Cowboy Bebop',
        status: 'pending',
    });
    assert.equal((await checkRecommend(base())).message, DUPLICATE);

    await PendingRecommendation.deleteMany({});
    await RecommendGuard.create({ userId: SENDER, lastSentAt: new Date(NOW - 1000) });
    assert.equal((await checkRecommend(base())).message, COOLDOWN);
    await RecommendGuard.updateOne({ userId: SENDER }, { lastSentAt: new Date(NOW - COOLDOWN_MS - 1) });
    assert.equal((await checkRecommend(base())).ok, true);

    await RecommendGuard.updateOne(
        { userId: TARGET },
        { receivedDay: '2026-06-01', receivedCount: DAILY_CAP },
        { upsert: true },
    );
    assert.equal((await checkRecommend(base())).message, DAILY);
    const guard = await RecommendGuard.findOne({ userId: TARGET });
    assert.equal(guard.receivedCount, DAILY_CAP);
});

test('a closed DM does not consume the cooldown or create a pending recommendation', async () => {
    await reset();
    await allow(TARGET);
    let sends = 0;
    const closed = await deliverRecommend(base({
        send: async () => {
            sends += 1;
            throw new Error('Cannot send messages to this user');
        },
    }));
    assert.equal(closed.closedDm, true);
    assert.equal(closed.message, DM_CLOSED);
    assert.equal(sends, 1);
    assert.equal(await PendingRecommendation.countDocuments(), 0);
    assert.equal(await RecommendGuard.countDocuments(), 0);

    let payload;
    const opened = await deliverRecommend(base({
        send: async (body) => {
            payload = body;
        },
    }));
    assert.equal(opened.ok, true);
    assert.equal(opened.message, SENT);
    assert.equal(payload.allowedMentions.parse.length, 0);
    assert.deepEqual(payload.allowedMentions.roles, []);
    assert.equal(payload.content.includes('@everyone'), false);
    assert.match(payload.content, /recommended/);
    assert.equal(payload.embeds[0].toJSON().image.url, media.cover);
    assert.equal(Buffer.isBuffer(payload.embeds[0].toJSON().image.url), false);
    const ids = payload.components[0].toJSON().components.map((button) => button.custom_id);
    assert.match(ids[0], /^rec:a:[a-f0-9]{16}$/);
    assert.match(ids[1], /^rec:d:[a-f0-9]{16}$/);
    assert.equal(await PendingRecommendation.countDocuments({ status: 'pending' }), 1);
    const senderGuard = await RecommendGuard.findOne({ userId: SENDER });
    assert.ok(senderGuard.lastSentAt);
    const targetGuard = await RecommendGuard.findOne({ userId: TARGET });
    assert.equal(targetGuard.receivedCount, 1);
});

test('object ids are not queried', async () => {
    await reset();
    await allow(TARGET);
    const result = await deliverRecommend(base({
        senderId: { $gt: '' },
        targetId: { $ne: null },
        anilist: { $gt: '' },
    }));
    assert.equal(result.ok, false);
    assert.equal(await PendingRecommendation.countDocuments(), 0);
    assert.deepEqual(await searchProfiles({ $gt: '' }), []);
    assert.equal((await profileForViewer({ $gt: '' }, SENDER)).message, HIDDEN);
});

test('accept and decline survive outside a guild, and a stranger cannot press them', async () => {
    await reset();
    await allow(TARGET, {
        accepted: Array.from({ length: 25 }, (_, index) => ({
            anilistId: String(index + 1),
            title: `Show ${index}`,
            fromUserId: SENDER,
            at: new Date(NOW),
        })),
    });
    const pending = await PendingRecommendation.create({
        publicId: 'b'.repeat(16),
        senderId: SENDER,
        targetId: TARGET,
        guildId: '100000000000000010',
        anilistId: '99',
        title: 'Trigun',
        status: 'pending',
    });
    const updates = [];
    const replies = [];
    let fetched = 0;
    const client = {
        users: {
            fetch: async () => {
                fetched += 1;
                throw new Error('DMs closed');
            },
        },
    };
    const interaction = {
        customId: `rec:a:${pending.publicId}`,
        user: { id: TARGET, username: 'Reno' },
        guild: null,
        channel: null,
        message: { embeds: [] },
        replied: false,
        deferred: false,
        update: async (body) => updates.push(body),
        reply: async (body) => replies.push(body),
    };
    await interactionCreate.execute({
        ...interaction,
        isButton: () => true,
        isChatInputCommand: () => false,
    }, client);
    assert.equal(updates.length, 1);
    assert.match(updates[0].content, /accepted/i);
    assert.equal(fetched, 1);
    const saved = await AnimeProfile.findOne({ userId: TARGET });
    assert.equal(saved.accepted.length, 25);
    assert.equal(saved.accepted.at(-1).anilistId, '99');
    assert.equal(saved.accepted.some((item) => item.anilistId === '1'), false);
    assert.equal((await PendingRecommendation.findOne({ publicId: pending.publicId })).status, 'accepted');

    await PendingRecommendation.create({
        publicId: 'c'.repeat(16),
        senderId: SENDER,
        targetId: TARGET,
        guildId: '100000000000000010',
        anilistId: '50',
        title: 'Bebop',
        status: 'pending',
    });
    replies.length = 0;
    await handleRecommendButton({
        customId: `rec:a:${'c'.repeat(16)}`,
        user: { id: OTHER, username: 'Nope' },
        reply: async (body) => replies.push(body),
        update: async () => { throw new Error('stranger updated the message'); },
    }, client);
    assert.match(replies[0].content, /not for you/);
    assert.equal((await PendingRecommendation.findOne({ publicId: 'c'.repeat(16) })).status, 'pending');

    await handleRecommendButton({
        customId: `rec:d:${'c'.repeat(16)}`,
        user: { id: TARGET, username: 'Reno' },
        message: { embeds: [] },
        update: async (body) => updates.push(body),
        reply: async (body) => replies.push(body),
    }, client);
    assert.equal((await PendingRecommendation.findOne({ publicId: 'c'.repeat(16) })).status, 'declined');
    assert.equal((await AnimeProfile.findOne({ userId: TARGET })).accepted.some((item) => item.anilistId === '50'), false);

    replies.length = 0;
    await interactionCreate.execute({
        isButton: () => true,
        isChatInputCommand: () => false,
        customId: 'help:home',
        guild: null,
        channel: null,
        reply: async () => { throw new Error('unrelated button replied'); },
    }, client);
    await interactionCreate.execute({
        isChatInputCommand: () => true,
        isButton: () => false,
        commandName: 'search',
        guild: null,
        channel: null,
        reply: async () => { throw new Error('dm slash command replied'); },
    }, { commands: { get() { throw new Error('looked up a command'); } } });
});

test('private profiles are hidden with the same reply, including search', async () => {
    await reset();
    await allow(HIDDEN_USER, { discoverable: false, bio: 'secret mecha fan' });
    await allow(OTHER, { discoverable: true, bio: 'public mecha fan', recommendations: false });
    const missing = await profileForViewer('100000000000000009', SENDER);
    const hidden = await profileForViewer(HIDDEN_USER, SENDER);
    assert.equal(missing.show, false);
    assert.equal(hidden.show, false);
    assert.equal(missing.message, HIDDEN);
    assert.equal(hidden.message, HIDDEN);
    const owner = await profileForViewer(HIDDEN_USER, HIDDEN_USER);
    assert.equal(owner.show, true);
    assert.equal(owner.self, true);
    const stranger = await profileForViewer(OTHER, SENDER);
    assert.equal(stranger.show, true);
    const found = await searchProfiles('mecha');
    assert.deepEqual(found.map((profile) => profile.userId), [OTHER]);
    assert.deepEqual(await searchProfiles('.*'), []);
    assert.equal((await profileForViewer(SENDER, SENDER)).message, SETUP_FIRST);
});

test('setup and bio store plain text and reject a slur without echoing it', async () => {
    await reset();
    const replies = [];
    const interaction = {
        user: { id: SENDER },
        options: {
            getBoolean(name) {
                return name === 'discoverable' ? false : true;
            },
            getString() {
                return 'n1gg3r hello';
            },
        },
        reply: async (body) => replies.push(body),
    };
    await setupCommand.execute(interaction);
    const created = await AnimeProfile.findOne({ userId: SENDER });
    assert.equal(created.discoverable, false);
    assert.equal(created.recommendations, true);
    assert.equal(replies[0].allowedMentions.parse.length, 0);

    await bioCommand.execute(interaction);
    assert.equal((await AnimeProfile.findOne({ userId: SENDER })).bio, '');
    assert.equal(replies.at(-1).content.includes('n1gg3r'), false);
    assert.equal(replies.at(-1).content.toLowerCase().includes('nigg'), false);

    interaction.options.getString = () => '@@everyone loves <@123456789012345678> jazz';
    await bioCommand.execute(interaction);
    const bio = (await AnimeProfile.findOne({ userId: SENDER })).bio;
    assert.equal(bio.includes('@everyone'), false);
    assert.equal(bio.includes('<@'), false);
    assert.match(bio, /everyone/);

    await setupCommand.execute(interaction);
    assert.match(replies.at(-1).content, /\/settings/);
});
