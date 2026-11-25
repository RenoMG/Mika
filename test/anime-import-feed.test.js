const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

let mongod;
let mongoose;
let AnimeProfile;
let AnimeFollow;
let AnilistLink;
let imports;
let feed;
let library;

const OWNER = '100000000000000001';
const FAN = '100000000000000002';
const OTHER = '100000000000000003';

before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoose = require('mongoose');
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongod.getUri());
    AnimeProfile = require('../src/Models/AnimeProfile');
    AnimeFollow = require('../src/Models/AnimeFollow');
    AnilistLink = require('../src/Models/AnilistLink');
    await AnimeProfile.createIndexes();
    await AnimeFollow.createIndexes();
    await AnilistLink.createIndexes();
    imports = require('../src/anime/anilistImport');
    feed = require('../src/anime/feed');
    library = require('../src/anime/library');
});

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

function media(id, title, extra = {}) {
    return {
        id,
        isAdult: false,
        format: 'TV',
        episodes: 12,
        duration: 24,
        genres: ['Action'],
        seasonYear: 2020,
        title: { english: title, romaji: title },
        ...extra,
    };
}

function entry(status, show, extra = {}) {
    return {
        status,
        progress: 3,
        repeat: 0,
        notes: '',
        private: false,
        score: 0,
        startedAt: { year: 2024, month: 1, day: 2 },
        completedAt: { year: null, month: null, day: null },
        updatedAt: 1714000000,
        createdAt: 1713000000,
        media: show,
        ...extra,
    };
}

function userBody(code, extra = {}) {
    return {
        data: {
            User: {
                id: 777,
                name: 'RenoTest',
                about: `Hi! ${code} <script>alert(1)</script>`,
                favourites: {
                    anime: { nodes: [{ id: 1, isAdult: false, title: { english: 'Fav <@123456789012345678>' } }, { id: 66, isAdult: true, title: { english: 'Adult' } }] },
                    characters: { nodes: [{ id: 5, name: { full: 'Spike **Spiegel**' } }] },
                    staff: { nodes: [{ id: 6, name: { full: 'Shinichiro Watanabe' } }] },
                    studios: { nodes: [{ id: 7, name: 'Sunrise https://bad.example' }] },
                },
                ...extra,
            },
        },
    };
}

function listBody(entries, custom = []) {
    return {
        data: {
            MediaListCollection: {
                hasNextChunk: false,
                lists: [
                    { name: 'Watching', isCustomList: false, entries },
                    ...custom,
                ],
            },
        },
    };
}

test('import parsing drops unsafe, adult, private, and malformed rows', () => {
    const now = Date.UTC(2026, 0, 1);
    const good = imports.readEntry(entry('CURRENT', media(10, 'Good <@123456789012345678> **show**'), {
        notes: 'note with @everyone and https://phish.example and `code`',
        score: 8.5,
    }), now);
    assert.equal(good.status, 'watching');
    assert.equal(good.row.title, 'Good user show');
    assert.equal(good.row.notes.includes('@everyone'), false);
    assert.equal(good.row.notes.includes('http'), false);
    assert.equal(good.row.notes.includes('`'), false);
    assert.equal(good.row.score, 8.5);
    assert.equal(good.row.progress, 3);
    assert.equal(good.row.startedAt.toISOString(), '2024-01-02T00:00:00.000Z');

    assert.equal(imports.readEntry(entry('CURRENT', media(11, 'Adult', { isAdult: true })), now), null);
    assert.equal(imports.readEntry(entry('CURRENT', media(12, 'Private'), { private: true }), now), null);
    assert.equal(imports.readEntry(entry('HACKED', media(13, 'Bad status')), now), null);
    assert.equal(imports.readEntry(entry('CURRENT', media('13; drop', 'Bad id')), now), null);
    assert.equal(imports.readEntry(entry('CURRENT', { ...media(14, ''), title: {} }), now), null);
    assert.equal(imports.readEntry({ status: 'CURRENT', media: null }, now), null);
    assert.equal(imports.readEntry('not an object', now), null);

    const odd = imports.readEntry(entry('COMPLETED', media(15, 'Odd', { episodes: -5, duration: 99999, genres: 'Action' }), {
        progress: 1e9, repeat: 'lots', score: 99, updatedAt: 'yesterday', completedAt: { year: 2023, month: 13, day: 1 },
    }), now);
    assert.equal(odd.row.episodes, undefined);
    assert.equal(odd.row.duration, undefined);
    assert.equal(odd.row.genres, undefined);
    assert.equal(odd.row.progress, undefined);
    assert.equal(odd.row.rewatches, undefined);
    assert.equal(odd.row.score, undefined);
    assert.ok(odd.row.completedAt instanceof Date, 'a completed row always gets a finish date');

    const user = imports.readUser(userBody('mika-AAAA'));
    assert.equal(user.favorites.anime.length, 1, 'adult favorites are skipped');
    assert.equal(user.favorites.anime[0].title, 'Fav user');
    assert.equal(user.favorites.character[0].name, 'Spike Spiegel');
    assert.equal(user.favorites.studio[0].name, 'Sunrise');
    assert.equal(imports.readUser({ data: { User: { id: 'x', name: 'Reno' } } }), null);
    assert.equal(imports.readUser({ data: { User: { id: 1, name: 'bad name!' } } }), null);
});

test('usernames and codes are strict', () => {
    assert.equal(imports.validUsername('Reno_99'), 'Reno_99');
    assert.equal(imports.validUsername('a'), null);
    assert.equal(imports.validUsername('reno"){ evil }'), null);
    assert.equal(imports.validUsername('x'.repeat(21)), null);
    assert.equal(imports.validUsername({ toString: () => 'Reno' }), null);
    const code = imports.makeCode();
    assert.match(code, /^mika-[A-Z2-9]{8}$/);
    assert.equal(imports.hasCode(`bio ${code} bio`, code), true);
    assert.equal(imports.hasCode('bio mika-XXXXXXXX', code), false);
    assert.equal(imports.hasCode('anything', ''), false);
});

test('a GraphQL username only ever travels as a variable', async () => {
    const calls = [];
    const query = async (text, variables) => {
        calls.push({ text, variables });
        return { notFound: true };
    };
    const result = await imports.fetchUser('Reno', { query });
    assert.equal(result.reason, 'noUser');
    assert.equal(calls[0].text, imports.USER_QUERY);
    assert.deepEqual(calls[0].variables, { name: 'Reno' });
    assert.equal(calls[0].text.includes('Reno'), false);
});

test('merge and replace imports keep caps, recommendations, and Mika-only shows', () => {
    const doc = new AnimeProfile({
        userId: OWNER,
        watchingList: [{ anilistId: '1', title: 'Rec', recommended: true, fromUserId: FAN }],
        planningList: [{ anilistId: '2', title: 'Mika only' }],
    });
    const imported = {
        entries: [
            { status: 'completed', row: { anilistId: '1', title: 'Rec', score: 9, completedAt: new Date('2024-01-01') } },
            { status: 'dropped', row: { anilistId: '3', title: 'Dropped' } },
        ],
        custom: [{ name: 'Comfort', entries: [{ anilistId: '1', title: 'Rec' }] }],
    };
    const merged = imports.applyImport(doc, imported, { mode: 'merge' });
    assert.equal(merged.counts.completed, 1);
    assert.equal(merged.counts.planning, 1, 'merge keeps shows only on Mika');
    assert.equal(merged.counts.watching, 0);
    assert.equal(doc.completedList[0].recommended, true, 'the 💌 mark survives');
    assert.equal(doc.customLists[0].name, 'Comfort');
    assert.equal(merged.customAdded, 1);

    const replaced = imports.applyImport(doc, imported, { mode: 'replace' });
    assert.equal(replaced.counts.planning, 0, 'replace matches AniList');
    assert.equal(replaced.counts.dropped, 1);
    assert.equal(doc.customLists.length, 1, 'custom lists merge by name instead of duplicating');

    const many = { entries: Array.from({ length: 60 }, (_, index) => ({
        status: 'watching',
        row: { anilistId: String(100 + index), title: `W${index}`, updatedAt: new Date(Date.UTC(2024, 0, 1 + index)) },
    })) };
    const capped = imports.applyImport(new AnimeProfile({ userId: OTHER }), many, { mode: 'replace' });
    assert.equal(capped.counts.watching, 50);
    assert.equal(capped.skipped, 10);
});

test('verification needs the code in the bio, limits attempts, then imports and links', async () => {
    imports.resetImportState();
    await AnimeProfile.deleteMany({});
    await AnilistLink.deleteMany({});
    const profile = await AnimeProfile.create({ userId: OWNER, favorites: [{ anilistId: '9', title: 'Mine' }] });
    const started = await imports.startLink(OWNER, 'RenoTest', { mode: 'merge' });
    assert.equal(started.ok, true);
    assert.equal((await imports.startLink(OWNER, 'bad name!')).reason, 'username');

    let about = 'no code here';
    const queries = [];
    const query = async (text, variables) => {
        queries.push(variables);
        if (text === imports.USER_QUERY) return userBody(about);
        return listBody([
            entry('CURRENT', media(10, 'Watching One')),
            entry('COMPLETED', media(11, 'Done One'), { score: 7.5, completedAt: { year: 2024, month: 3, day: 3 } }),
            entry('CURRENT', media(12, 'Adult', { isAdult: true })),
        ], [{ name: 'Faves <@123456789012345678>', isCustomList: true, entries: [entry('COMPLETED', media(11, 'Done One'))] }]);
    };
    const missing = await imports.verifyAndImport(OWNER, profile, { query });
    assert.equal(missing.reason, 'codeMissing');
    assert.equal(queries.length, 1, 'no list is fetched before the code checks out');

    about = `hello ${started.code}`;
    const fresh = await AnimeProfile.findOne({ userId: OWNER });
    const done = await imports.verifyAndImport(OWNER, fresh, { query });
    assert.equal(done.ok, true);
    assert.equal(done.imported, 2);
    const saved = await AnimeProfile.findOne({ userId: OWNER });
    assert.equal(saved.anilist.id, '777');
    assert.equal(saved.anilist.name, 'RenoTest');
    assert.equal(saved.watchingList.length, 1);
    assert.equal(saved.completedList[0].score, 7.5);
    assert.equal(saved.customLists[0].name, 'Faves user');
    assert.equal(saved.favorites[0].title, 'Mine', 'existing favorites stay first');
    assert.equal(saved.favorites[1].title, 'Fav user');
    assert.equal(saved.favoriteCharacters[0].name, 'Spike Spiegel');
    assert.equal(JSON.stringify(saved.toObject()).includes('<script>'), false, 'the bio is never stored');
    assert.equal(await AnilistLink.countDocuments({ userId: OWNER }), 0, 'the code is used up');
    assert.equal((await imports.verifyAndImport(OWNER, saved, { query })).reason, 'cooldown');

    imports.resetImportState();
    await imports.startLink(OTHER, 'Someone');
    const other = await AnimeProfile.create({ userId: OTHER });
    for (let index = 0; index < imports.MAX_VERIFY_ATTEMPTS; index += 1) {
        assert.equal((await imports.verifyAndImport(OTHER, other, { query: async () => userBody('nope') })).reason, 'codeMissing');
        imports.resetImportState();
    }
    assert.equal((await imports.verifyAndImport(OTHER, other, { query: async () => userBody('nope') })).reason, 'tooMany');
});

test('a linked resync refuses a renamed account that is not the verified one', async () => {
    imports.resetImportState();
    const doc = new AnimeProfile({ userId: FAN, anilist: { id: '777', name: 'RenoTest' } });
    doc.save = async () => doc;
    const stolen = await imports.resyncLinked(FAN, doc, {
        query: async (text) => (text === imports.USER_QUERY ? { data: { User: { id: 999, name: 'RenoTest', about: '' } } } : null),
    });
    assert.equal(stolen.ok, false);
    assert.equal(stolen.reason, 'noUser');
});

function fakeTimers() {
    const jobs = [];
    return {
        jobs,
        setTimeout: (fn, ms) => { const job = { fn, ms }; jobs.push(job); return job; },
        clearTimeout: (job) => { if (job) job.cancelled = true; },
        run: async () => {
            while (jobs.length) {
                const job = jobs.shift();
                if (!job.cancelled) await job.fn();
            }
        },
    };
}

function fakeClient({ sent, dms, closed = new Set(), guildId = '400000000000000001' }) {
    const channel = {
        guildId,
        guild: { id: guildId, members: { me: { id: 'bot' } } },
        permissionsFor: () => ({ has: () => true }),
        send: async (payload) => sent.push(payload),
    };
    return {
        channels: { cache: new Map([['300000000000000001', channel]]) },
        users: {
            fetch: async (id) => ({
                send: async (payload) => {
                    if (closed.has(id)) {
                        const error = new Error('Cannot send messages to this user');
                        error.code = 50007;
                        throw error;
                    }
                    dms.push({ id, payload });
                },
            }),
        },
    };
}

test('the Watch Feed merges updates, respects opt-ins, and DMs followers', async () => {
    await AnimeProfile.deleteMany({});
    await AnimeFollow.deleteMany({});
    await AnimeProfile.create({ userId: OWNER, nameLabel: 'Reno', activityFeed: true, allowFollows: true });
    await AnimeProfile.create({ userId: FAN, nameLabel: 'Fan' });
    assert.equal((await feed.follow(FAN, OWNER)).ok, true);
    assert.equal((await feed.follow(FAN, OWNER)).reason, 'already');
    assert.equal((await feed.follow(OWNER, OWNER)).reason, 'self');
    assert.equal((await feed.follow(OWNER, FAN)).reason, 'closed');
    assert.equal((await feed.follow(OTHER, '100000000000000099')).reason, 'missing');

    const sent = [];
    const dms = [];
    const timers = fakeTimers();
    const config = { FeedStatus: [{ Status: 'true' }], FeedChannel: [{ Channel: '300000000000000001' }] };
    const instance = feed.createFeed({ delayMs: 10, spacingMs: 0, readConfig: async () => config, timers });
    const client = fakeClient({ sent, dms });
    const base = { userId: OWNER, client, guildId: '400000000000000001', user: { globalName: 'Reno <@&123456789012345678>' } };
    instance.record({ ...base, type: 'progress', anilistId: '5', title: 'Frieren', progress: 1, fromProgress: 0, episodes: 28 });
    instance.record({ ...base, type: 'progress', anilistId: '5', title: 'Frieren', progress: 2, fromProgress: 1, episodes: 28 });
    instance.record({ ...base, type: 'progress', anilistId: '5', title: 'Frieren', progress: 3, fromProgress: 2, episodes: 28 });
    assert.equal(instance.pendingCount(), 1, 'three ticks on one show become one update');
    await timers.run();
    await instance.settle(timers.run);
    assert.equal(sent.length, 1);
    const text = sent[0].embeds[0].toJSON().description;
    assert.match(text, /watched episodes 1–3 of 28 of \*\*Frieren\*\*/);
    assert.equal(text.includes('<@&'), false);
    assert.deepEqual(sent[0].allowedMentions.parse, []);
    assert.equal(dms.length, 1);
    assert.equal(dms[0].id, FAN);
    assert.equal(dms[0].payload.components[0].toJSON().components[0].custom_id, `feed:u:${OWNER}`);

    // Sharing turned off before the merge window ends: nothing posts.
    await AnimeProfile.updateOne({ userId: OWNER }, { $set: { activityFeed: false, allowFollows: false } });
    instance.record({ ...base, type: 'status', status: 'completed', anilistId: '5', title: 'Frieren', score: 10 });
    await timers.run();
    assert.equal(sent.length, 1);
    assert.equal(dms.length, 1);

    // A server with the feed off gets nothing even when the member opted in.
    await AnimeProfile.updateOne({ userId: OWNER }, { $set: { activityFeed: true } });
    const off = feed.createFeed({ delayMs: 10, readConfig: async () => ({ FeedStatus: [{ Status: 'false' }] }), timers });
    off.record({ ...base, type: 'status', status: 'dropped', anilistId: '6', title: 'X' });
    await timers.run();
    assert.equal(sent.length, 1);
});

test('closed DMs remove a follow after repeated failures, and the Unfollow button only affects the clicker', async () => {
    await AnimeProfile.deleteMany({});
    await AnimeFollow.deleteMany({});
    await AnimeProfile.create({ userId: OWNER, nameLabel: 'Reno', allowFollows: true });
    await feed.follow(FAN, OWNER);
    await feed.follow(OTHER, OWNER);
    const sent = [];
    const dms = [];
    const timers = fakeTimers();
    const instance = feed.createFeed({ delayMs: 1, spacingMs: 0, readConfig: async () => null, timers });
    const client = fakeClient({ sent, dms, closed: new Set([FAN]) });
    for (let index = 0; index < feed.DM_FAILURE_CAP; index += 1) {
        instance.record({ userId: OWNER, client, type: 'score', anilistId: String(index + 1), title: 'S', score: 7 });
        await timers.run();
        await instance.settle(timers.run);
    }
    assert.equal(await AnimeFollow.countDocuments({ followerId: FAN }), 0);
    assert.equal(await AnimeFollow.countDocuments({ followerId: OTHER }), 1);
    assert.equal(dms.filter((dm) => dm.id === OTHER).length, feed.DM_FAILURE_CAP);

    const replies = [];
    const click = {
        customId: `feed:u:${OWNER}`,
        user: { id: FAN },
        update: async () => {},
        followUp: async (payload) => replies.push(payload),
    };
    assert.equal(feed.isUnfollowButton(click.customId), true);
    assert.equal(feed.isUnfollowButton('feed:u:123'), false);
    await feed.handleUnfollowButton(click);
    assert.equal(await AnimeFollow.countDocuments({ followerId: OTHER }), 1, 'only the clicker is unfollowed');
    await feed.handleUnfollowButton({ ...click, user: { id: OTHER } });
    assert.equal(await AnimeFollow.countDocuments({}), 0);
    assert.equal(await feed.dropFollowers(OWNER), 0);
});

test('activity lines read naturally for every status', () => {
    const line = (event) => feed.activityText(event);
    assert.equal(line({ type: 'status', status: 'watching', title: 'A' }), 'started watching **A**');
    assert.equal(line({ type: 'status', status: 'watching', from: 'paused', title: 'A' }), 'picked **A** back up');
    assert.equal(line({ type: 'status', status: 'completed', title: 'A', score: 9 }), 'completed **A** and rated it ★9');
    assert.equal(line({ type: 'status', status: 'completed', from: 'rewatching', title: 'A' }), 'finished rewatching **A**');
    assert.equal(line({ type: 'status', status: 'dropped', title: 'A', progress: 4, episodes: 12 }), 'dropped **A** at episode 4 of 12');
    assert.equal(line({ type: 'status', status: 'planning', title: '**x** <@123456789012345678>' }), 'plans to watch **x user**');
    assert.equal(line({ type: 'progress', title: 'A', progress: 5 }), 'watched episode 5 of **A**');
    assert.equal(line({ type: 'import', count: 12 }), 'synced their list from AniList (12 shows)');
    assert.ok(library.STATUSES.length === 6);
});

test('feed timing: status changes post fast, episode ticks merge, nothing waits past the cap', async () => {
    const timers = fakeTimers();
    let clock = 1000000;
    const instance = feed.createFeed({ readConfig: async () => null, timers, now: () => clock });
    const base = { userId: OWNER, client: {}, guildId: '400000000000000001' };
    instance.record({ ...base, type: 'status', status: 'completed', anilistId: '1', title: 'A' });
    assert.equal(timers.jobs.at(-1).ms, feed.QUICK_DELAY_MS);
    assert.ok(feed.QUICK_DELAY_MS <= 5000);

    instance.record({ ...base, type: 'progress', anilistId: '2', title: 'B', progress: 1 });
    assert.equal(timers.jobs.at(-1).ms, feed.PROGRESS_QUIET_MS);
    // Keep ticking every 10 seconds: the wait shrinks so the post lands by the cap.
    for (let tick = 2; tick <= 5; tick += 1) {
        clock += 10000;
        instance.record({ ...base, type: 'progress', anilistId: '2', title: 'B', progress: tick });
        const elapsed = clock - 1000000;
        assert.ok(elapsed + timers.jobs.at(-1).ms <= feed.MAX_WAIT_MS, `tick ${tick} posts within the cap`);
    }
    assert.equal(timers.jobs.at(-1).ms, feed.MAX_WAIT_MS - 40000, 'the last tick only waits out the cap');
    assert.equal(instance.pendingCount(), 2);
    assert.equal(feed.MAX_WAIT_MS <= 60000, true);
});

test('follower DMs go out through several senders at once', async () => {
    await AnimeProfile.deleteMany({});
    await AnimeFollow.deleteMany({});
    await AnimeProfile.create({ userId: OWNER, nameLabel: 'Reno', allowFollows: true });
    const fans = Array.from({ length: 9 }, (_, index) => String(BigInt('200000000000000000') + BigInt(index)));
    await AnimeFollow.insertMany(fans.map((followerId) => ({ followerId, targetId: OWNER })));
    let inFlight = 0;
    let peak = 0;
    const delivered = [];
    const client = {
        users: {
            fetch: async (id) => ({
                send: async () => {
                    inFlight += 1;
                    peak = Math.max(peak, inFlight);
                    await new Promise((resolve) => setImmediate(resolve));
                    inFlight -= 1;
                    delivered.push(id);
                },
            }),
        },
    };
    const timers = fakeTimers();
    const instance = feed.createFeed({ quickMs: 0, readConfig: async () => null, timers });
    instance.record({ userId: OWNER, client, type: 'score', anilistId: '1', title: 'S', score: 8 });
    await timers.run();
    await instance.settle(timers.run);
    assert.equal(delivered.length, fans.length);
    assert.equal(peak, feed.DM_WORKERS);
});
