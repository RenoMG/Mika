const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { MessageFlags } = require('discord.js');

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
let FullListNotice;
let deliverRecommend;
let checkRecommend;
let handleRecommendButton;
let interactionCreate;
let profileForViewer;
let searchProfiles;
let deleteProfile;
let HIDDEN;
let SETUP_FIRST;
let NOT_SETUP;
let acceptConfirmation;
let declineConfirmation;
let acceptanceNotice;
let recommendationDm;
let watchListFull;
let fullListNotice;
let profileCommand;
let findProfileCommand;
let readFavorites;
let addFavorite;
let removeFavorite;
let applyFavorites;
let setupCommand;
let bioCommand;
let watchingCommand;
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
    await FullListNotice.deleteMany({});
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
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongod.getUri(), { dbName: 'mika' });
    AnimeProfile = require('../src/Models/AnimeProfile');
    ({ PendingRecommendation, RecommendGuard, FullListNotice } = require('../src/Models/AnimeRecommend'));
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
        acceptConfirmation,
        declineConfirmation,
        acceptanceNotice,
        recommendationDm,
        watchListFull,
        fullListNotice,
    } = require('../src/anime/recommend'));
    await FullListNotice.init();
    ({
        HIDDEN,
        SETUP_FIRST,
        NOT_SETUP,
        profileForViewer,
        searchProfiles,
        deleteProfile,
    } = require('../src/anime/profiles'));
    ({
        readFavorites,
        addFavorite,
        removeFavorite,
        applyFavorites,
    } = require('../src/anime/favorites'));
    profileCommand = require('../src/commands/anime/profile');
    findProfileCommand = require('../src/commands/anime/findprofile');
    interactionCreate = require('../src/events/interactionCreate');
    setupCommand = require('../src/commands/anime/setup');
    bioCommand = require('../src/commands/anime/bio');
    watchingCommand = require('../src/commands/anime/watching');
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
    assert.equal(await RecommendGuard.countDocuments({ lastSentAt: { $exists: true } }), 0);
    assert.equal(await RecommendGuard.countDocuments({ receivedCount: { $gt: 0 } }), 0);
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
            throw Object.assign(new Error('Cannot send messages to this user'), { code: 50007 });
        },
    }));
    assert.equal(closed.closedDm, true);
    assert.equal(closed.message, DM_CLOSED);
    assert.equal(sends, 1);
    assert.equal(await PendingRecommendation.countDocuments(), 0);
    assert.equal(await RecommendGuard.countDocuments({ lastSentAt: { $exists: true } }), 0);
    assert.equal(await RecommendGuard.countDocuments({ receivedCount: { $gt: 0 } }), 0);

    let payload;
    const opened = await deliverRecommend(base({
        send: async (body) => {
            payload = body;
        },
    }));
    assert.equal(opened.ok, true);
    assert.equal(opened.message, SENT);
    assert.equal(payload.allowedMentions.parse.length, 0);
    assert.deepEqual(payload.allowedMentions.users, []);
    assert.deepEqual(payload.allowedMentions.roles, []);
    assert.equal(payload.allowedMentions.repliedUser, false);
    assert.equal(payload.content, recommendationDm('@everyone', media));
    assert.equal(payload.content.includes('@everyone'), false);
    assert.equal(payload.content.includes('<@'), false);
    assert.match(payload.content, /✨ \*\*everyone\*\* thinks you'd love \*\*Cowboy Bebop\*\*!/);
    assert.match(payload.content, /Accept to add it to your watching list, or decline/);
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
    assert.equal(updates[0].content, acceptConfirmation('Trigun'));
    assert.equal(updates[0].content.includes('full'), false);
    assert.deepEqual(updates[0].allowedMentions.parse, []);
    assert.deepEqual(updates[0].allowedMentions.users, []);
    assert.equal(fetched, 1);
    const saved = await AnimeProfile.findOne({ userId: TARGET });
    assert.equal(saved.accepted.length, 25);
    assert.equal(saved.accepted.some((item) => item.anilistId === '99'), false);
    assert.equal(saved.accepted.some((item) => item.anilistId === '1'), true);
    assert.equal(saved.watchingList.length, 1);
    assert.equal(saved.watchingList[0].anilistId, '99');
    assert.equal(saved.watchingList[0].title, 'Trigun');
    assert.equal(saved.watchingList[0].title.includes('💌'), false);
    assert.equal(saved.watchingList[0].recommended, true);
    assert.equal(saved.watchingList[0].fromUserId, SENDER);
    assert.equal(saved.watching, '');
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
    assert.equal(updates.at(-1).content, declineConfirmation('Bebop'));
    const afterDecline = await AnimeProfile.findOne({ userId: TARGET });
    assert.equal(afterDecline.accepted.some((item) => item.anilistId === '50'), false);
    assert.equal(afterDecline.watchingList.some((item) => item.anilistId === '50'), false);

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

test('accepting a show already on the list marks it and leaves the old text alone', async () => {
    await reset();
    await allow(TARGET, {
        discoverable: true,
        watching: 'Old free text',
        accepted: [{ anilistId: '3', title: 'Stay', fromUserId: SENDER }],
        watchingList: [{ anilistId: '99', title: 'Trigun', recommended: false, fromUserId: '' }],
    });
    const pending = await PendingRecommendation.create({
        publicId: 'e'.repeat(16),
        senderId: SENDER,
        targetId: TARGET,
        guildId: '100000000000000010',
        anilistId: '99',
        title: 'Trigun',
        status: 'pending',
    });
    const updates = [];
    await handleRecommendButton({
        customId: `rec:a:${pending.publicId}`,
        user: { id: TARGET, username: 'Reno' },
        message: { embeds: [] },
        update: async (body) => updates.push(body),
        reply: async () => {},
    }, { users: { fetch: async () => { throw new Error('DMs closed'); } } });
    assert.equal(updates[0].content, acceptConfirmation('Trigun'));
    assert.equal(updates[0].content.includes('full'), false);
    const saved = await AnimeProfile.findOne({ userId: TARGET });
    assert.equal(saved.watchingList.length, 1);
    assert.equal(saved.watchingList[0].anilistId, '99');
    assert.equal(saved.watchingList[0].title, 'Trigun');
    assert.equal(saved.watchingList[0].title.includes('💌'), false);
    assert.equal(saved.watchingList[0].recommended, true);
    assert.equal(saved.watchingList[0].fromUserId, SENDER);
    assert.equal(saved.watching, 'Old free text');
    assert.equal(saved.accepted.length, 1);
    assert.equal(saved.accepted[0].anilistId, '3');
    assert.equal((await PendingRecommendation.findOne({ publicId: pending.publicId })).status, 'accepted');
    const found = await searchProfiles('Trigun');
    assert.deepEqual(found.map((profile) => profile.userId), [TARGET]);
});

test('a full watching list leaves acceptance pending and retryable', async () => {
    await reset();
    await allow(TARGET, {
        watching: 'Do not drop',
        accepted: [{ anilistId: '77', title: 'Keep', fromUserId: SENDER }],
        watchingList: Array.from({ length: require('../src/anime/watching').MAX_WATCHING }, (_, index) => ({
            anilistId: String(index + 1),
            title: `Show ${index + 1}`,
            recommended: false,
            fromUserId: '',
        })),
    });
    const pending = await PendingRecommendation.create({
        publicId: 'f'.repeat(16),
        senderId: SENDER,
        targetId: TARGET,
        guildId: '100000000000000010',
        anilistId: '99',
        title: 'Extra',
        status: 'pending',
    });
    const updates = [];
    await handleRecommendButton({
        customId: `rec:a:${pending.publicId}`,
        user: { id: TARGET, username: 'Reno' },
        message: { embeds: [] },
        update: async (body) => updates.push(body),
        reply: async (body) => updates.push(body),
    }, { users: { fetch: async () => ({ send: async () => {} }) } });
    assert.match(updates[0].content, /watching list is full/);
    assert.match(updates[0].content, /accept again/);
    const saved = await AnimeProfile.findOne({ userId: TARGET });
    assert.equal(saved.watchingList.length, require('../src/anime/watching').MAX_WATCHING);
    assert.equal(saved.watchingList.some((item) => item.anilistId === '99'), false);
    assert.equal(saved.watching, 'Do not drop');
    assert.equal(saved.accepted.length, 1);
    assert.equal(saved.accepted[0].anilistId, '77');
    assert.equal((await PendingRecommendation.findOne({ publicId: pending.publicId })).status, 'pending');
});

test('watching clear keeps the legacy line, and remove can delete it', async () => {
    await reset();
    await allow(SENDER, {
        watching: 'Old show',
        watchingList: [{ anilistId: '4', title: 'Cowboy Bebop', recommended: true, fromUserId: '' }],
    });
    const choices = [];
    await watchingCommand.autocomplete({
        user: { id: SENDER },
        commandName: 'watching',
        options: {
            getSubcommand: () => 'remove',
            getFocused: () => ({ value: '' }),
        },
        respond: async (rows) => choices.push(...rows),
    });
    assert.deepEqual(choices.map((choice) => choice.value), ['4', 'legacy']);
    assert.equal(choices[0].name.startsWith('💌 '), true);
    assert.equal(choices[1].name, 'Old show');

    const replies = [];
    await watchingCommand.execute({
        user: { id: SENDER },
        options: {
            getSubcommand: () => 'clear',
            getString: () => null,
        },
        reply: async (body) => replies.push(body),
    });
    let saved = await AnimeProfile.findOne({ userId: SENDER });
    assert.equal(saved.watchingList.length, 0);
    assert.equal(saved.watching, 'Old show');
    assert.match(replies[0].content, /older saved line/);
    assert.deepEqual(replies[0].allowedMentions.parse, []);

    replies.length = 0;
    await watchingCommand.execute({
        user: { id: SENDER },
        options: {
            getSubcommand: () => 'remove',
            getString: () => 'legacy',
        },
        reply: async (body) => replies.push(body),
    });
    saved = await AnimeProfile.findOne({ userId: SENDER });
    assert.equal(saved.watching, '');
    assert.match(replies[0].content, /Removed \*\*Old show\*\*/);
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

    const sameServer = await profileForViewer(HIDDEN_USER, SENDER, { sameGuild: true });
    assert.equal(sameServer.show, true);
    assert.equal(sameServer.ephemeral, false);
    assert.equal(sameServer.self, false);
    const missingHere = await profileForViewer('100000000000000009', SENDER, { sameGuild: true });
    assert.equal(missingHere.show, false);
    assert.equal(missingHere.ephemeral, true);
    assert.equal(missingHere.message, NOT_SETUP);
});

test('setup and bio modal store plain text and reject a slur or an overlong bio', async () => {
    await reset();
    const replies = [];
    const modals = [];
    const interaction = {
        user: { id: SENDER, username: 'reno' },
        guild: { id: '100000000000000010' },
        member: null,
        options: {
            getBoolean() {
                return true;
            },
            getString(name) {
                return name === 'visibility' ? 'local' : null;
            },
        },
        reply: async (body) => replies.push(body),
        showModal: async (modal) => modals.push(modal),
    };
    await setupCommand.execute(interaction);
    const created = await AnimeProfile.findOne({ userId: SENDER });
    assert.equal(created.discoverable, false);
    assert.equal(created.recommendations, true);
    assert.equal(replies[0].allowedMentions.parse.length, 0);

    let openBio;
    interaction.fetchReply = async () => ({ createMessageComponentCollector: () => ({ on(event, handler) { if (event === 'collect') openBio = handler; } }) });
    await bioCommand.execute(interaction);
    assert.equal(modals.length, 0);
    await openBio({ user: interaction.user, showModal: interaction.showModal });
    assert.equal(modals.length, 1);
    const emptyInput = modals[0].toJSON().components[0].components[0];
    assert.equal(emptyInput.max_length, bioCommand.BIO_MAX);
    assert.equal(emptyInput.value, undefined);
    assert.equal((await AnimeProfile.findOne({ userId: SENDER })).bio, '');

    const submit = (userId, text) => bioCommand.handleBioModal({
        customId: `bio:edit:${SENDER}`,
        user: { id: userId, username: 'reno' },
        guild: { id: '100000000000000010' },
        fields: { getTextInputValue: () => text },
        reply: async (body) => replies.push(body),
    });

    await submit(SENDER, 'n1gg3r hello');
    assert.equal((await AnimeProfile.findOne({ userId: SENDER })).bio, '');
    assert.equal(replies.at(-1).content, "That text isn't allowed.");
    assert.equal(replies.at(-1).content.includes('n1gg3r'), false);
    assert.equal(replies.at(-1).content.toLowerCase().includes('nigg'), false);
    assert.equal(replies.at(-1).allowedMentions.parse.length, 0);

    await submit(OTHER, 'sneaky bio');
    assert.equal((await AnimeProfile.findOne({ userId: SENDER })).bio, '');
    assert.match(replies.at(-1).content, /Only the person who used \/bio/);

    await submit(SENDER, '@@everyone loves <@123456789012345678> jazz');
    const bio = (await AnimeProfile.findOne({ userId: SENDER })).bio;
    assert.equal(bio.includes('@everyone'), false);
    assert.equal(bio.includes('<@'), false);
    assert.match(bio, /everyone/);
    assert.equal(replies.at(-1).content, '✅ Bio saved.');
    assert.equal(replies.at(-1).allowedMentions.parse.length, 0);

    await submit(SENDER, 'a'.repeat(bioCommand.BIO_MAX + 1));
    assert.equal((await AnimeProfile.findOne({ userId: SENDER })).bio, bio);
    assert.match(replies.at(-1).content, new RegExp(String(bioCommand.BIO_MAX)));
    assert.equal(replies.at(-1).allowedMentions.parse.length, 0);

    modals.length = 0;
    await bioCommand.execute(interaction);
    await openBio({ user: interaction.user, showModal: interaction.showModal });
    assert.equal(modals.at(-1).toJSON().components[0].components[0].value, bio);

    await interactionCreate.execute({
        isButton: () => false,
        isAutocomplete: () => false,
        isModalSubmit: () => true,
        isChatInputCommand: () => false,
        customId: `bio:edit:${SENDER}`,
        user: { id: SENDER, username: 'reno' },
        guild: { id: '100000000000000010' },
        fields: { getTextInputValue: () => 'n1gg3r again' },
        reply: async (body) => replies.push(body),
    }, {});
    assert.equal((await AnimeProfile.findOne({ userId: SENDER })).bio, bio);
    assert.equal(replies.at(-1).content, "That text isn't allowed.");

    await setupCommand.execute(interaction);
    assert.match(replies.at(-1).content, /\/settings/);
});

function person(id, name) {
    return {
        id,
        username: name,
        displayAvatarURL: () => 'https://cdn.example/a.png',
    };
}

test('profile replies are public for a real profile and ephemeral when it is missing', async () => {
    await reset();
    await allow(HIDDEN_USER, { discoverable: false, bio: 'quiet' });
    await allow(OTHER, { discoverable: true, bio: 'open' });
    const replies = [];
    const reply = async (body) => replies.push(body);

    await profileCommand.execute({
        user: person(HIDDEN_USER, 'Hidden'),
        options: { getUser: () => null },
        reply,
    });
    assert.equal(replies[0].flags, undefined);
    assert.equal(replies[0].embeds.length, 1);

    replies.length = 0;
    await profileCommand.execute({
        user: person(SENDER, 'Sender'),
        options: {
            getUser: () => person(HIDDEN_USER, 'Hidden'),
            getMember: () => ({ id: HIDDEN_USER }),
        },
        reply,
    });
    assert.equal(replies[0].flags, undefined);

    replies.length = 0;
    await profileCommand.execute({
        user: person(SENDER, 'Sender'),
        options: {
            getUser: () => person(HIDDEN_USER, 'Hidden'),
            getMember: () => null,
        },
        reply,
    });
    assert.equal(replies[0].flags, MessageFlags.Ephemeral);
    assert.equal(replies[0].content, HIDDEN);

    replies.length = 0;
    await profileCommand.execute({
        user: person(SENDER, 'Sender'),
        options: {
            getUser: () => person(OTHER, 'Other'),
            getMember: () => null,
        },
        reply,
    });
    assert.equal(replies[0].flags, undefined);

    replies.length = 0;
    await profileCommand.execute({
        user: person(SENDER, 'Sender'),
        options: { getUser: () => null },
        reply,
    });
    assert.equal(replies[0].flags, MessageFlags.Ephemeral);
    assert.equal(replies[0].content, SETUP_FIRST);
});

test('findprofile posts a discoverable match and keeps misses private', async () => {
    await reset();
    await allow(OTHER, { discoverable: true, bio: 'public mecha fan' });
    await allow(HIDDEN_USER, { discoverable: false, bio: 'secret mecha fan' });
    const replies = [];
    const reply = async (body) => {
        replies.push(body);
        return { resource: { message: { createMessageComponentCollector() { return { on() { return this; } }; } } } };
    };

    await findProfileCommand.execute({
        user: person(SENDER, 'Sender'),
        options: { getString: () => 'nope' },
        reply,
    }, {});
    assert.equal(replies[0].flags, MessageFlags.Ephemeral);

    replies.length = 0;
    await findProfileCommand.execute({
        user: person(SENDER, 'Sender'),
        options: { getString: () => 'mecha' },
        reply,
    }, { users: { fetch: async () => person(OTHER, 'Other') } });
    assert.equal(replies[0].flags, undefined);
    assert.match(replies[0].content, /Profiles matching/);
    assert.equal(replies[0].allowedMentions.parse.length, 0);
});

test('reading a legacy favorite does not rewrite it, and edits keep the list capped', async () => {
    await reset();
    await allow(SENDER, { discoverable: true, favoriteId: '7', favoriteTitle: 'Trigun' });
    const doc = await AnimeProfile.findOne({ userId: SENDER });
    assert.deepEqual(readFavorites(doc).map((item) => item.anilistId), ['7']);
    const stored = await AnimeProfile.findOne({ userId: SENDER });
    assert.equal(stored.favoriteId, '7');
    assert.equal(stored.favoriteTitle, 'Trigun');
    assert.equal(stored.favorites.length, 0);

    let current = stored;
    for (const [id, title] of [['8', 'Bebop'], ['9', 'Planetes'], ['10', 'Monster'], ['11', 'Odd Taxi']]) {
        const added = addFavorite(current, { id, titles: { english: title } });
        assert.equal(added.ok, true);
        applyFavorites(current, added.list);
        await current.save();
        current = await AnimeProfile.findOne({ userId: SENDER });
    }
    assert.equal(current.favorites.length, 5);
    assert.equal(current.favoriteId, '7');
    assert.equal(current.favorites[0].title, 'Trigun');
    const overflow = addFavorite(current, { id: '12', titles: { english: 'Extra' } });
    assert.equal(overflow.ok, false);
    assert.equal(overflow.reason, 'full');
    assert.equal(current.favorites.length, 5);

    const removed = removeFavorite(current, '7');
    assert.equal(removed.ok, true);
    applyFavorites(current, removed.list);
    await current.save();
    const after = await AnimeProfile.findOne({ userId: SENDER });
    assert.equal(after.favorites.some((item) => item.anilistId === '7'), false);
    assert.equal(after.favoriteId, '8');
    const found = await searchProfiles('Planetes');
    assert.deepEqual(found.map((profile) => profile.userId), [SENDER]);
});

test('an acceptance tells the sender without pinging anyone', async () => {
    await reset();
    await allow(TARGET);
    const pending = await PendingRecommendation.create({
        publicId: 'd'.repeat(16),
        senderId: SENDER,
        targetId: TARGET,
        guildId: '100000000000000010',
        anilistId: '42',
        title: 'Planetes',
        status: 'pending',
    });
    const sent = [];
    await handleRecommendButton({
        customId: `rec:a:${pending.publicId}`,
        user: { id: TARGET, username: '@everyone' },
        message: { embeds: [] },
        update: async () => {},
        reply: async () => {},
    }, {
        users: {
            fetch: async () => ({
                send: async (body) => sent.push(body),
            }),
        },
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].content, acceptanceNotice('@everyone', 'Planetes'));
    assert.equal(sent[0].content.includes('@everyone'), false);
    assert.equal(sent[0].content.includes('<@'), false);
    assert.deepEqual(sent[0].allowedMentions.parse, []);
    assert.deepEqual(sent[0].allowedMentions.users, []);
    assert.deepEqual(sent[0].allowedMentions.roles, []);
});

function filledWatching(length) {
    return Array.from({ length }, (_, index) => ({
        anilistId: String(index + 1),
        title: `Show ${index + 1}`,
        recommended: false,
        fromUserId: '',
    }));
}

test('one free watching slot still sends the recommendation', async () => {
    await reset();
    const { MAX_WATCHING } = require('../src/anime/watching');
    await allow(TARGET, { watchingList: filledWatching(MAX_WATCHING - 1) });
    let payload;
    const opened = await deliverRecommend(base({
        targetName: 'Reno',
        send: async (body) => {
            payload = body;
        },
    }));
    assert.equal(opened.ok, true);
    assert.equal(opened.message, SENT);
    assert.match(payload.content, /or decline\./);
    assert.equal(await FullListNotice.countDocuments(), 0);
});

test('a full watching list blocks the send, uses the cooldown, and DMs once per pair per day', async () => {
    await reset();
    const { MAX_WATCHING } = require('../src/anime/watching');
    let sends = 0;
    const missing = await deliverRecommend(base({
        targetName: 'Ghost',
        send: async () => {
            sends += 1;
        },
    }));
    assert.equal(missing.message, NO_PROFILE);
    assert.equal(sends, 0);

    await allow(TARGET, { recommendations: false, watchingList: filledWatching(MAX_WATCHING) });
    const closed = await deliverRecommend(base({
        targetName: 'Reno',
        send: async () => {
            sends += 1;
        },
    }));
    assert.equal(closed.message, RECS_OFF);
    assert.equal(sends, 0);
    assert.equal(await FullListNotice.countDocuments(), 0);
    assert.equal(await RecommendGuard.countDocuments({ lastSentAt: { $exists: true } }), 0);
    assert.equal(await RecommendGuard.countDocuments({ receivedCount: { $gt: 0 } }), 0);

    await AnimeProfile.updateOne({ userId: TARGET }, { recommendations: true });
    const looked = await checkRecommend(base());
    assert.equal(looked.full, true);
    assert.equal(looked.skipNotice, false);
    assert.equal(await RecommendGuard.countDocuments({ lastSentAt: { $exists: true } }), 0);
    assert.equal(await RecommendGuard.countDocuments({ receivedCount: { $gt: 0 } }), 0);
    assert.equal(await FullListNotice.countDocuments(), 0);

    let payload;
    const first = await deliverRecommend(base({
        senderName: '@everyone',
        targetName: 'Reno',
        send: async (body) => {
            sends += 1;
            payload = body;
        },
    }));
    assert.equal(first.ok, false);
    assert.equal(first.message, watchListFull('Reno'));
    assert.equal(first.message, "Reno's watching list is full.");
    assert.equal(sends, 1);
    assert.equal(payload.content, fullListNotice('@everyone', media).content);
    assert.equal(payload.content.includes('@everyone'), false);
    assert.equal(payload.content.includes('<@'), false);
    assert.match(payload.content, /📭 \*\*everyone\*\* tried to recommend you \*\*Cowboy Bebop\*\*/);
    assert.match(payload.content, /watching list is full \(50\/50\)/);
    assert.match(payload.content, /\/watching remove or mark something completed/);
    assert.equal(payload.embeds, undefined);
    assert.equal(payload.components, undefined);
    assert.deepEqual(payload.allowedMentions.parse, []);
    assert.deepEqual(payload.allowedMentions.users, []);
    assert.deepEqual(payload.allowedMentions.roles, []);
    assert.equal(payload.allowedMentions.repliedUser, false);
    assert.equal(await PendingRecommendation.countDocuments(), 0);
    const senderGuard = await RecommendGuard.findOne({ userId: SENDER });
    assert.equal(new Date(senderGuard.lastSentAt).getTime(), NOW);
    assert.equal((await RecommendGuard.findOne({ userId: TARGET })).receivedCount, 1);
    assert.equal(await FullListNotice.countDocuments(), 1);

    const second = await deliverRecommend(base({
        now: NOW + 1000,
        targetName: 'Reno',
        send: async () => {
            sends += 1;
        },
    }));
    assert.equal(second.message, COOLDOWN);
    assert.equal(sends, 1);
    assert.equal(new Date((await RecommendGuard.findOne({ userId: SENDER })).lastSentAt).getTime(), NOW);

    const later = NOW + COOLDOWN_MS + 1000;
    const third = await deliverRecommend(base({
        now: later,
        senderName: '@everyone',
        targetName: 'Reno',
        send: async () => {
            sends += 1;
        },
    }));
    assert.equal(third.message, watchListFull('Reno'));
    assert.equal(sends, 1);
    assert.equal(await FullListNotice.countDocuments(), 1);
    assert.equal((await RecommendGuard.findOne({ userId: SENDER })).lastSentAt, undefined);

    let otherPayload;
    const other = await deliverRecommend(base({
        senderId: OTHER,
        now: later,
        senderName: 'Other',
        targetName: 'Reno',
        send: async (body) => {
            sends += 1;
            otherPayload = body;
        },
    }));
    assert.equal(other.message, watchListFull('Reno'));
    assert.equal(sends, 2);
    assert.equal(otherPayload.content, fullListNotice('Other', media).content);
    assert.equal(await FullListNotice.countDocuments(), 2);
    assert.ok(await RecommendGuard.findOne({ userId: OTHER }));
});

test('a closed full-list DM is swallowed and the sender still gets the notice', async () => {
    await reset();
    const { MAX_WATCHING } = require('../src/anime/watching');
    await allow(TARGET, { watchingList: filledWatching(MAX_WATCHING) });
    const token = 'bbbbbbbbbbbbbbbbbbbb.CCCCC.dddddddddddddddddddd';
    const logs = [];
    const original = console.debug;
    console.debug = (...args) => {
        logs.push(args.map((part) => String(part)).join(' '));
    };
    try {
        const result = await deliverRecommend(base({
            targetName: 'Reno',
            send: async () => {
                throw new Error(`DMs closed ${token}`);
            },
        }));
        assert.equal(result.message, watchListFull('Reno'));
        assert.equal(await PendingRecommendation.countDocuments(), 0);
        assert.equal(new Date((await RecommendGuard.findOne({ userId: SENDER })).lastSentAt).getTime(), NOW);
        const safe = logs.join('\n').split(token).join('[redacted-token]');
        assert.equal(safe.includes(token), false);
        assert.match(safe, /\[redacted-token\]/);
        assert.match(safe, /DMs closed/);
    } finally {
        console.debug = original;
    }
});

test('a full list still tells the sender when the daily cap skips the DM', async () => {
    await reset();
    const { MAX_WATCHING } = require('../src/anime/watching');
    await allow(TARGET, { watchingList: filledWatching(MAX_WATCHING) });
    await RecommendGuard.create({ userId: TARGET, receivedDay: '2026-06-01', receivedCount: DAILY_CAP });
    let sends = 0;
    const result = await deliverRecommend(base({
        targetName: 'Reno',
        send: async () => {
            sends += 1;
        },
    }));
    assert.equal(result.message, watchListFull('Reno'));
    assert.notEqual(result.message, DAILY);
    assert.equal(sends, 0);
    assert.equal(await FullListNotice.countDocuments(), 0);
    assert.equal(await RecommendGuard.findOne({ userId: SENDER }), null);
    const targetGuard = await RecommendGuard.findOne({ userId: TARGET });
    assert.equal(targetGuard.receivedCount, DAILY_CAP);
});
