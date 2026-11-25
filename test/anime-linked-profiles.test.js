const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');

let mongod;
let mongoose;
let ProfileLink;
let LinkCode;
let linked;
let profileView;
let linkCommand;
let findprofile;
let profileCommand;
let search;
let legacy;

const OWNER = '100000000000000001';
const FRIEND = '100000000000000002';
const STRANGER = '100000000000000003';
const GUILD = '400000000000000001';

before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoose = require('mongoose');
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongod.getUri());
    ProfileLink = require('../src/Models/ProfileLink');
    LinkCode = require('../src/Models/LinkCode');
    await ProfileLink.createIndexes();
    await LinkCode.createIndexes();
    linked = require('../src/anime/linkedProfiles');
    profileView = require('../src/anime/profileView');
    linkCommand = require('../src/commands/anime/link');
    findprofile = require('../src/commands/anime/findprofile');
    profileCommand = require('../src/commands/anime/profile');
    search = require('../src/commands/anime/search');
    legacy = require('../src/db/legacyProfiles');
});

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

beforeEach(async () => {
    await ProfileLink.deleteMany({});
    await LinkCode.deleteMany({});
    linked.resetLinkedProfiles();
});

const HOSTILE = 'Hi! <script>alert(1)</script> ~!spoiler!~ img220(https://evil.example/x.png) [click](https://phish.example) @everyone <@123456789012345678> **bold** `code`';

function anilistBody(extra = {}) {
    return {
        data: {
            User: {
                id: 777,
                name: 'RenoTest',
                about: HOSTILE,
                siteUrl: 'https://anilist.co/user/777',
                avatar: { large: 'https://s4.anilist.co/file/a.png' },
                statistics: { anime: {
                    count: 120, episodesWatched: 1500, minutesWatched: 36000, meanScore: 78.4,
                    statuses: [{ status: 'COMPLETED', count: 100 }, { status: 'CURRENT', count: 5 }, { status: 'REPEATING', count: 1 }, { status: 'HACKED', count: 9 }],
                    genres: [{ genre: 'Action', count: 50 }, { genre: '<@&123456789012345678>', count: 2 }],
                } },
                favourites: {
                    anime: { nodes: [{ id: 1, isAdult: false, title: { english: 'Bebop **x**' } }, { id: 2, isAdult: true, title: { english: 'Adult' } }] },
                    characters: { nodes: [{ id: 3, name: { full: 'Spike' } }] },
                    staff: { nodes: [] },
                    studios: { nodes: [{ id: 4, name: 'Sunrise https://evil.example' }] },
                },
                ...extra,
            },
            watching: { mediaList: [
                { status: 'CURRENT', progress: 5, media: { id: 10, isAdult: false, episodes: 12, title: { english: 'Frieren' } } },
                { status: 'REPEATING', progress: 2, media: { id: 11, isAdult: false, episodes: null, title: { romaji: 'Mushishi' } } },
                { status: 'CURRENT', progress: 1, media: { id: 12, isAdult: true, episodes: 1, title: { english: 'Adult' } } },
            ] },
            completed: { mediaList: [{ score: 9.5, media: { id: 13, isAdult: false, title: { english: 'Monster' } } }, { score: 'x', media: null }] },
        },
    };
}

function malFull(extra = {}) {
    return {
        data: {
            mal_id: 42,
            username: 'RenoMal',
            images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/u/42.jpg' } },
            statistics: { anime: {
                days_watched: 30.5, mean_score: 7.9, watching: 3, completed: 90, on_hold: 2, dropped: 1,
                plan_to_watch: 20, total_entries: 116, episodes_watched: 1200,
            } },
            favorites: {
                anime: [{ mal_id: 1, title: 'Cowboy Bebop' }],
                characters: [{ mal_id: 2, name: 'Spiegel, Spike' }],
                people: [{ mal_id: 3, name: 'Watanabe, Shinichiro <@123456789012345678>' }],
            },
            updates: { anime: [
                { entry: { mal_id: 5, title: 'Frieren' }, status: 'Watching', episodes_seen: 4, episodes_total: 28, score: 0 },
                { entry: { mal_id: 6, title: 'Monster' }, status: 'Completed', episodes_seen: 74, episodes_total: 74, score: 10 },
                { entry: { mal_id: 7, title: 'Planned' }, status: 'Plan to Watch' },
            ] },
            ...extra,
        },
    };
}

test('AniList profiles are cleaned and adult titles are left out', () => {
    const profile = linked.readAnilistProfile(anilistBody());
    assert.equal(profile.name, 'RenoTest');
    assert.equal(profile.url, 'https://anilist.co/user/RenoTest');
    assert.equal(profile.avatar, 'https://s4.anilist.co/file/a.png');
    for (const bad of ['<script', 'alert', 'spoiler', 'evil', 'phish', '@everyone', '<@', '**', '`']) {
        assert.equal(profile.about.includes(bad), false, `about drops ${bad}`);
    }
    assert.match(profile.about, /^Hi!/);
    assert.equal(profile.stats.meanScore, 7.8, 'AniList 0–100 means show out of 10');
    assert.equal(profile.stats.statuses.watching, 6, 'rewatching counts as watching');
    assert.equal(profile.stats.days.toFixed(1), '25.0');
    assert.deepEqual(profile.genres.map(([genre]) => genre), ['Action', 'role']);
    assert.deepEqual(profile.watching.map((row) => row.title), ['Frieren', 'Mushishi']);
    assert.equal(profile.watching[1].rewatch, true);
    assert.deepEqual(profile.completed, [{ title: 'Monster', score: 9.5 }]);
    assert.deepEqual(profile.favorites.anime, ['Bebop x']);
    assert.deepEqual(profile.favorites.studios, ['Sunrise']);
    assert.equal(linked.readAnilistProfile({ data: { User: { id: 'x', name: 'Reno' } } }), null);
    assert.equal(linked.readAnilistProfile(anilistBody({ avatar: { large: 'https://evil.example/a.png' } })).avatar, undefined);
});

test('MyAnimeList profiles from Jikan are cleaned the same way', () => {
    const profile = linked.readMalProfile(malFull(), { data: { about: HOSTILE } });
    assert.equal(profile.site, 'mal');
    assert.equal(profile.url, 'https://myanimelist.net/profile/RenoMal');
    assert.equal(profile.about.includes('<script'), false);
    assert.equal(profile.stats.count, 116);
    assert.equal(profile.stats.statuses.paused, 2);
    assert.equal(profile.stats.meanScore, 7.9);
    assert.deepEqual(profile.watching, [{ title: 'Frieren', progress: 4, episodes: 28, rewatch: false }]);
    assert.deepEqual(profile.completed, [{ title: 'Monster', score: 10 }]);
    assert.deepEqual(profile.favorites.staff, ['Watanabe, Shinichiro user']);
    assert.equal(linked.readMalProfile({ data: { username: 'bad name!' } }), null);
    assert.equal(linked.readMalProfile(malFull({ statistics: { anime: { days_watched: -5, mean_score: 99 } } })).stats.meanScore, null);
});

test('usernames are strict per site and codes look right', () => {
    assert.equal(linked.validUsername('anilist', 'Reno_99'), 'Reno_99');
    assert.equal(linked.validUsername('mal', 'x'.repeat(17)), null);
    assert.equal(linked.validUsername('anilist', 'a"){ evil }'), null);
    assert.equal(linked.validUsername('anilist', '../../etc'), null);
    assert.equal(linked.validUsername('nope', 'Reno'), null);
    assert.match(linked.makeCode(), /^mika-[A-Z2-9]{8}$/);
});

test('a profile is fetched once and then served from the cache', async () => {
    let calls = 0;
    const deps = { anilistQuery: async (query, variables) => { calls += 1; assert.deepEqual(variables, { id: 777 }); return anilistBody(); } };
    const [a, b] = await Promise.all([
        linked.fetchProfile('anilist', { id: '777', name: 'RenoTest' }, deps),
        linked.fetchProfile('anilist', { id: '777', name: 'RenoTest' }, deps),
    ]);
    assert.equal(a.ok && b.ok, true);
    const again = await linked.fetchProfile('anilist', { id: '777', name: 'RenoTest' }, deps);
    assert.equal(again.cached, true);
    assert.equal(calls, 1);

    const paths = [];
    const mal = await linked.fetchProfile('mal', { name: 'RenoMal' }, {
        jikanGet: async (path) => { paths.push(path); return path.endsWith('/about') ? { data: { about: 'hello' } } : malFull(); },
    });
    assert.equal(mal.profile.about, 'hello');
    assert.deepEqual(paths.sort(), ['/users/RenoMal/about', '/users/RenoMal/full']);
    const missing = await linked.fetchProfile('mal', { name: 'Ghost' }, { jikanGet: async () => ({ notFound: true }) });
    assert.equal(missing.reason, 'noUser');
    const down = await linked.fetchProfile('anilist', { id: '5' }, { anilistQuery: async () => null });
    assert.equal(down.reason, 'unavailable');
});

test('linking needs the code in the live bio, limits tries, and moves an account to its prover', async () => {
    const started = await linked.startLink(OWNER, 'anilist', 'RenoTest');
    assert.equal(started.ok, true);
    let about = 'nothing here';
    const queries = [];
    const deps = {
        anilistQuery: async (query, variables) => {
            queries.push({ query, variables });
            return { data: { User: { id: 777, name: 'RenoTest', about } } };
        },
        user: { id: OWNER, username: 'reno', globalName: 'Reno' },
    };
    assert.equal((await linked.verifyLink(OWNER, 'anilist', deps)).reason, 'codeMissing');
    assert.equal(queries[0].query, linked.ANILIST_LOOKUP);
    assert.deepEqual(queries[0].variables, { name: 'RenoTest' });
    assert.equal(queries[0].query.includes('RenoTest'), false, 'the name never goes into the query text');

    about = `hello ${started.code}`;
    const done = await linked.verifyLink(OWNER, 'anilist', deps);
    assert.equal(done.ok, true);
    const saved = await ProfileLink.findOne({ userId: OWNER });
    assert.equal(saved.anilist.id, '777');
    assert.equal(saved.anilist.name, 'RenoTest');
    assert.equal(saved.nameLabel, undefined, 'no Discord names are stored');
    assert.equal(JSON.stringify(saved.toObject()).includes('hello'), false, 'the bio is never stored');
    assert.equal(await LinkCode.countDocuments({ userId: OWNER }), 0, 'the code is used up');

    // Someone else proves the same account later: it moves to them.
    const theirs = await linked.startLink(FRIEND, 'anilist', 'RenoTest');
    about = theirs.code;
    assert.equal((await linked.verifyLink(FRIEND, 'anilist', { ...deps, user: { id: FRIEND, username: 'friend' } })).ok, true);
    assert.equal((await ProfileLink.findOne({ userId: OWNER })).anilist, undefined);
    assert.equal((await ProfileLink.findOne({ userId: FRIEND })).anilist.id, '777');

    await linked.startLink(STRANGER, 'mal', 'Someone');
    for (let index = 0; index < linked.MAX_VERIFY_ATTEMPTS; index += 1) {
        assert.equal((await linked.verifyLink(STRANGER, 'mal', { jikanGet: async () => ({ data: { about: 'no', username: 'Someone' } }) })).reason, 'codeMissing');
    }
    assert.equal((await linked.verifyLink(STRANGER, 'mal', { jikanGet: async () => ({ data: { about: 'no' } }) })).reason, 'tooMany');
    assert.equal((await linked.verifyLink('100000000000000009', 'anilist', deps)).reason, 'noCode');
});

test('unlinking forgets the account, and an empty link row is deleted', async () => {
    await ProfileLink.create({ userId: OWNER, anilist: { id: '1', name: 'A' }, mal: { name: 'B' } });
    assert.deepEqual((await linked.unlink(OWNER, 'mal')).removed, ['mal']);
    assert.equal((await ProfileLink.findOne({ userId: OWNER })).anilist.name, 'A');
    assert.deepEqual((await linked.unlink(OWNER, 'all')).removed, ['anilist']);
    assert.equal(await ProfileLink.countDocuments({ userId: OWNER }), 0);
    assert.equal((await linked.unlink(OWNER, 'all')).ok, false);
});

function interaction({ sub = null, strings = {}, users = {}, members = {}, userId = OWNER, cache = new Map() }) {
    const sent = [];
    return {
        sent,
        id: `i-${Math.random()}`,
        commandName: 'test',
        createdTimestamp: Date.now(),
        deferred: false,
        replied: false,
        ephemeral: false,
        guildId: GUILD,
        guild: { id: GUILD, members: { cache, fetch: async () => { throw new Error('not cached'); } } },
        user: { id: userId, username: 'reno', globalName: 'Reno', displayAvatarURL: () => 'https://cdn.example/a.png' },
        member: { id: userId },
        options: {
            getSubcommand: () => sub,
            getString: (name) => (name in strings ? strings[name] : null),
            getUser: (name) => users[name] || null,
            getMember: (name) => members[name] || null,
        },
        async deferReply(payload) { this.deferred = true; this.ephemeral = Boolean(payload && payload.flags); },
        async editReply(payload) { sent.push({ ...payload, ephemeral: this.ephemeral }); return payload; },
        async reply(payload) { sent.push(payload); return payload; },
        async followUp(payload) { sent.push(payload); return payload; },
        async deleteReply() {},
        async fetchReply() { return null; },
    };
}

function text(payload) {
    if (payload.content) return payload.content;
    return JSON.stringify((payload.embeds || []).map((embed) => (embed.toJSON ? embed.toJSON() : embed)));
}

test('/link gives a private code with a Verify button that only its owner can press', async () => {
    const run = interaction({ sub: 'myanimelist', strings: { username: 'RenoMal' } });
    await linkCommand.execute(run, null, {});
    assert.equal(run.ephemeral, true);
    assert.match(text(run.sent[0]), /mika-[A-Z2-9]{8}/);
    assert.match(text(run.sent[0]), /About Me/);
    assert.equal(run.sent[0].components[0].toJSON().components[0].custom_id, `link:v:mal:${OWNER}`);
    const bad = interaction({ sub: 'anilist', strings: { username: 'no spaces allowed' } });
    await linkCommand.execute(bad, null, {});
    assert.match(text(bad.sent[0]), /does not look right/);

    const replies = [];
    await linkCommand.handleLinkButton({ customId: `link:v:mal:${OWNER}`, user: { id: FRIEND }, reply: async (payload) => replies.push(payload) });
    assert.match(replies[0].content, /belongs to someone else/);
    assert.equal(linkCommand.isLinkButton('link:v:evil:100000000000000001'), false);

    await ProfileLink.create({ userId: OWNER, anilist: { id: '1', name: 'RenoTest' } });
    const status = interaction({ sub: 'status' });
    await linkCommand.execute(status, null, {});
    assert.match(text(status.sent[0]), /AniList:\*\* RenoTest/);
    assert.match(text(status.sent[0]), /MyAnimeList:\*\* not linked/);
});

test('/profile shows a member\'s linked account publicly, with buttons when both are linked', async () => {
    await ProfileLink.create({ userId: FRIEND, anilist: { id: '777', name: 'RenoTest' }, mal: { name: 'RenoMal' } });
    const run = interaction({ users: { user: { id: FRIEND, username: 'friend' } }, members: { user: { id: FRIEND } } });
    await profileCommand.execute(run, null, {
        fetchProfile: async (site) => ({ ok: true, profile: site === 'anilist' ? linked.readAnilistProfile(anilistBody()) : linked.readMalProfile(malFull(), null) }),
    });
    assert.equal(run.ephemeral, false);
    const json = run.sent[0].embeds[0].toJSON();
    assert.equal(json.title, "friend's anime profile");
    assert.equal(json.url, 'https://anilist.co/user/RenoTest');
    assert.equal(json.fields[0].value, '• Frieren · 5/12\n• 🔁 Mushishi · ep 2');
    assert.equal(json.fields[2].value, '• Monster · ★9.5');
    const buttons = run.sent[0].components[0].toJSON().components;
    assert.deepEqual(buttons.map((button) => button.custom_id), ['profile:site:anilist', 'profile:site:mal']);
    assert.equal(buttons[0].disabled, true);
    assert.deepEqual(run.sent[0].allowedMentions.parse, []);

    const outsider = interaction({ users: { user: { id: STRANGER, username: 'x' } } });
    await profileCommand.execute(outsider, null, {});
    assert.match(text(outsider.sent[0]), /isn't in this server/);
    const unlinked = interaction({ users: { user: { id: STRANGER, username: 'x' } }, members: { user: { id: STRANGER } } });
    await profileCommand.execute(unlinked, null, {});
    assert.match(text(unlinked.sent[0]), /hasn't linked/);
    const wrongSite = interaction({ strings: { site: 'mal' } });
    await ProfileLink.create({ userId: OWNER, anilist: { id: '1', name: 'Mine' } });
    await profileCommand.execute(wrongSite, null, {});
    assert.match(text(wrongSite.sent[0]), /haven't linked MyAnimeList/);
});

test('/findprofile looks up any public profile by username, no link needed', async () => {
    const queries = [];
    const anilistQuery = async (query, variables) => {
        queries.push({ query, variables });
        if (query === linked.ANILIST_LOOKUP) return { data: { User: { id: 777, name: 'RenoTest', about: '' } } };
        return anilistBody();
    };
    const run = interaction({ strings: { site: 'anilist', username: 'RenoTest' } });
    await findprofile.execute(run, null, { lookupProfile: (site, name) => linked.lookupProfile(site, name, { anilistQuery }) });
    assert.equal(run.ephemeral, false);
    const json = run.sent[0].embeds[0].toJSON();
    assert.equal(json.title, 'RenoTest on AniList');
    assert.equal(json.url, 'https://anilist.co/user/RenoTest');
    assert.equal(json.thumbnail.url, 'https://s4.anilist.co/file/a.png');
    assert.deepEqual(queries.map((row) => row.variables), [{ name: 'RenoTest' }, { id: 777 }]);
    assert.equal(await ProfileLink.countDocuments(), 0, 'a lookup stores nothing');

    // The name and the profile are both cached: a second lookup costs nothing.
    await linked.lookupProfile('anilist', 'renotest', { anilistQuery });
    assert.equal(queries.length, 2);

    const mal = interaction({ strings: { site: 'mal', username: 'RenoMal' } });
    await findprofile.execute(mal, null, {
        lookupProfile: (site, name) => linked.lookupProfile(site, name, {
            jikanGet: async (path) => (path.endsWith('/about') ? { data: { about: 'hey' } } : malFull()),
        }),
    });
    assert.equal(mal.sent[0].embeds[0].toJSON().title, 'RenoMal on MyAnimeList');

    const ghost = interaction({ strings: { site: 'anilist', username: 'Ghost' } });
    await findprofile.execute(ghost, null, { lookupProfile: (site, name) => linked.lookupProfile(site, name, { anilistQuery: async () => ({ notFound: true }) }) });
    assert.match(text(ghost.sent[0]), /No public AniList profile is named \*\*Ghost\*\*/);

    const bad = interaction({ strings: { site: 'anilist', username: '../etc/passwd' } });
    await findprofile.execute(bad, null, { lookupProfile: async () => { throw new Error('should not look up'); } });
    assert.match(text(bad.sent[0]), /does not look right/);
    assert.equal((await linked.lookupProfile('anilist', 'a b')).reason, 'username');
});

test('/search type:Character and type:Studio open AniList cards', async () => {
    const character = { kind: 'character', id: '1', name: 'Spike Spiegel', description: 'Bounty hunter. ~!He dies!~', gender: 'Male', age: '27', favourites: 14357, url: 'https://anilist.co/character/1', image: 'https://s4.anilist.co/c.png', media: [{ id: '1', title: 'Cowboy Bebop', year: 1998 }], alternative: [] };
    const run = interaction({ strings: { query: 'Spike Spiegel', type: 'character' } });
    await search.execute(run, null, {
        searchEntities: async () => [{ id: '1', name: 'Spike Spiegel' }, { id: '2', name: 'Spike' }],
        getEntity: async (kind, id) => (kind === 'character' && id === '1' ? character : null),
    });
    const json = run.sent[0].embeds[0].toJSON();
    assert.equal(json.title, 'Spike Spiegel');
    assert.equal(json.description.includes('dies'), false, 'spoilers are hidden');
    assert.match(json.fields.find((field) => field.name === 'Appears in').value, /Cowboy Bebop \(1998\)/);

    const studio = interaction({ strings: { query: '11', type: 'studio' } });
    await search.execute(studio, null, {
        getEntity: async () => ({ kind: 'studio', id: '11', name: 'MADHOUSE', animation: true, favourites: 1, url: 'https://anilist.co/studio/11', media: [{ id: '1', title: 'Death Note', year: 2006 }] }),
    });
    assert.equal(studio.sent[0].embeds[0].toJSON().title, 'MADHOUSE');
    const none = interaction({ strings: { query: 'zzz', type: 'studio' } });
    await search.execute(none, null, { searchEntities: async () => [] });
    assert.match(text(none.sent[0]), /No studio matched/);
});

test('the legacy cleanup only drops old profile collections, and only with apply', async () => {
    const db = mongoose.connection.db;
    await db.collection('animeprofiles').insertOne({ userId: OWNER });
    await db.collection('animefollows').insertOne({ followerId: OWNER });
    await db.collection('levels').insertOne({ userID: OWNER, xp: 5 });
    const preview = await legacy.dropLegacyProfiles(db);
    assert.equal(preview.dryRun, true);
    assert.deepEqual(preview.collections.map((row) => row.name).sort(), ['animefollows', 'animeprofiles']);
    assert.equal(await db.collection('animeprofiles').countDocuments(), 1);
    await legacy.dropLegacyProfiles(db, { apply: true });
    const names = (await db.listCollections().toArray()).map((row) => row.name);
    assert.equal(names.includes('animeprofiles'), false);
    assert.equal(names.includes('levels'), true);
    assert.equal(profileView.SWITCH_PREFIX, 'profile:site:');
});
