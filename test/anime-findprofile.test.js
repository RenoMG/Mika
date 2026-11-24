const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { MessageFlags } = require('discord.js');
const { AUTOCOMPLETE_BUDGET_MS, resetAutocomplete } = require('../src/anime/autocomplete');

const VIEWER = '100000000000000001';
const PUBLIC = '100000000000000002';
const HIDDEN = '100000000000000004';
const MISSING = '100000000000000009';
const BACKFILL = '100000000000000088';

let mongoose;
let mongod;
let AnimeProfile;
let searchProfiles;
let rememberNames;
let noteIdentity;
let profileChoices;
let profileAutocomplete;
let escapeRegex;
let NOT_FOUND;
let NAME_LIMIT;
let RESULT_CAP;
let QUERY_MAX;
let findProfileCommand;

function auto(id, userId, query, respond, createdTimestamp = Date.now()) {
    return {
        id,
        commandName: 'findprofile',
        user: { id: userId },
        createdTimestamp,
        options: { getFocused: () => query },
        respond,
    };
}

async function blank(userId, extra = {}) {
    await AnimeProfile.create({
        userId,
        discoverable: false,
        recommendations: false,
        bio: '',
        watching: '',
        nameLabel: '',
        names: [],
        favoriteId: '',
        favoriteTitle: '',
        favorites: [],
        genres: [],
        tags: [],
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
    ({
        NOT_FOUND,
        QUERY_MAX,
        RESULT_CAP,
        NAME_LIMIT,
        escapeRegex,
        searchProfiles,
        rememberNames,
        noteIdentity,
        profileChoices,
        profileAutocomplete,
    } = require('../src/anime/profiles'));
    findProfileCommand = require('../src/commands/anime/findprofile');
}, { timeout: 180000 });

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

test('names are stored lowercase, labeled from the display name, and capped', () => {
    const doc = { names: [], nameLabel: '', favoriteTitle: 'Mob Psycho 100', watching: 'Keep' };
    for (let index = 0; index < 10; index += 1) {
        rememberNames(doc, { username: 'plxn', globalName: 'PLXN' }, { nickname: `Nick${index}` });
    }
    assert.equal(doc.nameLabel, 'PLXN');
    assert.equal(doc.names.length, NAME_LIMIT);
    assert.equal(doc.names[0], 'plxn');
    assert.equal(doc.names.includes('nick9'), true);
    assert.equal(doc.names.includes('nick0'), false);
    assert.equal(doc.names.includes('PLXN'), false);
    assert.equal(doc.favoriteTitle, 'Mob Psycho 100');
    assert.equal(doc.watching, 'Keep');
    rememberNames(doc, { username: { $gt: '' } }, null);
    assert.equal(doc.names.length, NAME_LIMIT);
    assert.equal(doc.nameLabel, 'PLXN');
});

test('profile choices use the display name, and hide other private profiles', () => {
    const profiles = [
        {
            userId: PUBLIC,
            discoverable: true,
            nameLabel: 'PLXN',
            favoriteTitle: 'Mob Psycho 100',
            favorites: [{ anilistId: '1', title: 'Mob Psycho 100' }],
            genres: ['Action'],
        },
        {
            userId: HIDDEN,
            discoverable: false,
            nameLabel: 'Secret Person',
            genres: ['Mecha'],
        },
    ];
    const shown = profileChoices(profiles, VIEWER, false);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].label, 'PLXN');
    assert.equal(shown[0].value, PUBLIC);
    assert.equal(shown[0].description, 'Mob Psycho 100');
    assert.equal(shown[0].label.includes('Mob'), false);
    assert.equal(JSON.stringify(shown).includes('Secret'), false);

    const genresOnly = profileChoices([{
        userId: PUBLIC,
        discoverable: true,
        nameLabel: 'PLXN',
        favoriteTitle: '',
        favorites: [],
        genres: ['Mecha', 'Drama'],
    }], VIEWER, false);
    assert.equal(genresOnly[0].label, 'PLXN');
    assert.equal(genresOnly[0].description, 'Mecha, Drama');

    const own = profileChoices(profiles, HIDDEN, true);
    assert.equal(own.some((choice) => choice.value === HIDDEN), true);
    assert.equal(own.find((choice) => choice.value === HIDDEN).label, 'Secret Person');
});

test('search is case-insensitive and partial, and regex text cannot match everything', async () => {
    await AnimeProfile.deleteMany({});
    await blank(PUBLIC, {
        discoverable: true,
        nameLabel: 'PLXN',
        names: ['plxn', 'planet'],
        bio: 'hello',
        favoriteTitle: 'Mob Psycho 100',
    });
    await blank(HIDDEN, {
        discoverable: false,
        nameLabel: 'Secret Person',
        names: ['secretperson', 'plxn'],
        bio: 'secret mecha fan',
    });
    await blank('100000000000000077', {
        discoverable: true,
        nameLabel: 'Dot',
        names: ['.*'],
        bio: 'literal',
    });

    assert.equal(escapeRegex('.*'), '\\.\\*');
    assert.equal(escapeRegex('('), '\\(');
    assert.equal(escapeRegex('$where'), '\\$where');
    for (const symbol of '.*+?^${}()|[]\\') {
        assert.equal(escapeRegex(symbol).startsWith('\\'), true);
    }

    for (const query of ['plxn', 'PLXN', 'Plx', 'xn', 'planet', 'PLAN']) {
        const found = await searchProfiles(query);
        assert.deepEqual(found.map((profile) => profile.userId), [PUBLIC], query);
    }
    const literal = await searchProfiles('.*');
    assert.deepEqual(literal.map((profile) => profile.userId), ['100000000000000077']);
    for (const query of ['(', '$where', '.*(', { $gt: '' }, { $where: '1' }, { $regex: '.*' }]) {
        const found = await searchProfiles(query);
        assert.ok(Array.isArray(found), String(query));
        assert.equal(found.some((profile) => profile.userId === PUBLIC), false);
        assert.equal(found.some((profile) => profile.userId === HIDDEN), false);
    }
    const injected = await searchProfiles('plxn', { includeSelf: true, viewerId: { $gt: '' } });
    assert.deepEqual(injected.map((profile) => profile.userId), [PUBLIC]);

    const selfOnly = await searchProfiles('secretperson', { viewerId: HIDDEN, includeSelf: true, namesOnly: true });
    assert.deepEqual(selfOnly.map((profile) => profile.userId), [HIDDEN]);
    assert.deepEqual(await searchProfiles('secretperson'), []);
    assert.deepEqual(await searchProfiles('secretperson', { viewerId: PUBLIC, includeSelf: true, namesOnly: true }), []);
});

test('results stop at 25 and a hidden profile is absent from search and autocomplete', async () => {
    await AnimeProfile.deleteMany({});
    await blank(HIDDEN, { discoverable: false, nameLabel: 'Hidden Cohort', names: ['cohort'] });
    for (let index = 0; index < 26; index += 1) {
        await blank(`4${String(index).padStart(17, '0')}`, {
            discoverable: true,
            nameLabel: `Fan ${index}`,
            names: ['cohort'],
        });
    }
    const found = await searchProfiles('cohort');
    assert.equal(found.length, RESULT_CAP);
    assert.equal(found.some((profile) => profile.userId === HIDDEN), false);
    assert.equal(found.some((profile) => profile.nameLabel === 'Hidden Cohort'), false);

    resetAutocomplete();
    const rows = [];
    await profileAutocomplete(auto('cap', VIEWER, 'cohort', async (choices) => {
        rows.push(choices);
    }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].length, 25);
    assert.equal(rows[0].some((choice) => choice.value === HIDDEN), false);
    assert.equal(JSON.stringify(rows).includes('Hidden Cohort'), false);

    const ownRows = [];
    await profileAutocomplete(auto('own', HIDDEN, 'cohort', async (choices) => {
        ownRows.push(choices);
    }));
    assert.equal(ownRows[0].some((choice) => choice.value === HIDDEN && choice.name === 'Hidden Cohort'), true);
});

test('the menu labels a result with the name, not the favorite', async () => {
    await AnimeProfile.deleteMany({});
    await blank(PUBLIC, {
        discoverable: true,
        nameLabel: 'PLXN',
        names: ['plxn'],
        favorites: [{ anilistId: '1', title: 'Mob Psycho 100' }],
        genres: ['Action'],
    });
    const replies = [];
    const reply = async (body) => {
        replies.push(body);
        return { resource: { message: { createMessageComponentCollector() { return { on() { return this; } }; } } } };
    };
    await findProfileCommand.execute({
        user: { id: VIEWER, username: 'Viewer' },
        options: { getString: () => 'PLX' },
        reply,
    }, {});
    const option = replies[0].components[0].toJSON().components[0].options[0];
    assert.equal(option.label, 'PLXN');
    assert.equal(option.value, PUBLIC);
    assert.equal(option.description, 'Mob Psycho 100');
    assert.equal(option.label.includes('Mob'), false);
    assert.equal(replies[0].flags, undefined);
    const json = findProfileCommand.data.toJSON();
    assert.equal(json.options[0].autocomplete, true);
    assert.equal(json.options[0].max_length, QUERY_MAX);
});

test('a picked id opens that profile, and a hidden id looks the same as a miss', async () => {
    await AnimeProfile.deleteMany({});
    await blank(PUBLIC, { discoverable: true, nameLabel: 'PLXN', names: ['plxn'] });
    await blank(HIDDEN, { discoverable: false, nameLabel: 'Secret Person', names: ['secretperson'], bio: 'secret mecha fan' });
    await blank(VIEWER, { discoverable: false, nameLabel: 'Only Mine', names: ['onlymine'] });
    const replies = [];
    const reply = async (body) => replies.push(body);
    const client = {
        users: {
            fetch: async (id) => ({ id, username: 'fetched', globalName: id === PUBLIC ? 'PLXN' : 'Only Mine' }),
        },
    };
    await findProfileCommand.execute({
        user: { id: VIEWER, username: 'Viewer' },
        options: { getString: () => HIDDEN },
        reply,
    }, client);
    await findProfileCommand.execute({
        user: { id: VIEWER, username: 'Viewer' },
        options: { getString: () => MISSING },
        reply,
    }, client);
    assert.equal(replies[0].content, NOT_FOUND);
    assert.equal(replies[1].content, NOT_FOUND);
    assert.equal(replies[0].content, replies[1].content);
    assert.equal(replies[0].content.toLowerCase().includes('secret'), false);
    assert.equal(replies[0].flags, MessageFlags.Ephemeral);
    assert.equal(replies[0].embeds, undefined);

    replies.length = 0;
    await findProfileCommand.execute({
        user: { id: VIEWER, username: 'Viewer' },
        options: { getString: () => PUBLIC },
        reply,
    }, client);
    assert.equal(replies[0].flags, undefined);
    assert.equal(replies[0].embeds.length, 1);
    assert.match(replies[0].embeds[0].toJSON().title, /PLXN/);

    replies.length = 0;
    await findProfileCommand.execute({
        user: { id: VIEWER, username: 'onlymine', globalName: 'Only Mine' },
        options: { getString: () => VIEWER },
        reply,
    }, client);
    assert.equal(replies[0].flags, MessageFlags.Ephemeral);
    assert.equal(replies[0].embeds.length, 1);
    assert.equal(replies[0].content, undefined);
});

test('viewing a profile backfills its name without deleting the rest', async () => {
    await AnimeProfile.deleteMany({});
    await blank(BACKFILL, { discoverable: true, bio: 'keep me', watching: 'Old show' });
    const created = await AnimeProfile.findOne({ userId: BACKFILL });
    assert.deepEqual(created.names, []);
    assert.equal(created.nameLabel, '');
    const replies = [];
    await findProfileCommand.execute({
        user: { id: VIEWER, username: 'Viewer' },
        options: { getString: () => BACKFILL },
        reply: async (body) => replies.push(body),
    }, {
        users: {
            fetch: async () => ({ id: BACKFILL, username: 'plxn', globalName: 'PLXN' }),
        },
    });
    const saved = await AnimeProfile.findOne({ userId: BACKFILL });
    assert.equal(saved.nameLabel, 'PLXN');
    assert.deepEqual(saved.names, ['plxn']);
    assert.equal(saved.bio, 'keep me');
    assert.equal(saved.watching, 'Old show');
    assert.equal(replies[0].flags, undefined);
    const found = await searchProfiles('plx');
    assert.deepEqual(found.map((profile) => profile.userId), [BACKFILL]);

    const doc = await AnimeProfile.findOne({ userId: BACKFILL });
    await noteIdentity(doc, { id: BACKFILL, username: 'plxn', globalName: 'PLXN' }, { nickname: 'Planet' });
    const renamed = await AnimeProfile.findOne({ userId: BACKFILL });
    assert.equal(renamed.bio, 'keep me');
    assert.ok(renamed.names.includes('planet'));
    assert.equal(renamed.nameLabel, 'PLXN');
    assert.deepEqual((await searchProfiles('PLAN')).map((profile) => profile.userId), [BACKFILL]);
});

test('autocomplete answers before the deadline and skips a stale keystroke', async () => {
    resetAutocomplete();
    const now = 5_000_000;
    const rows = [];
    let finished = false;
    const started = Date.now();
    await profileAutocomplete(auto('slow', VIEWER, 'plxn', async (choices) => {
        rows.push(choices);
    }, now - (AUTOCOMPLETE_BUDGET_MS - 80)), {
        now: () => now,
        search: () => new Promise((resolve) => {
            setTimeout(() => {
                finished = true;
                resolve([{
                    userId: HIDDEN,
                    discoverable: false,
                    nameLabel: 'Secret Person',
                }]);
            }, 400);
        }),
    });
    assert.equal(finished, false);
    assert.deepEqual(rows, [[]]);
    assert.ok(Date.now() - started < 300);
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.equal(finished, true);
    assert.equal(JSON.stringify(rows).includes('Secret'), false);

    resetAutocomplete();
    let resolveSearch;
    const pending = new Promise((resolve) => {
        resolveSearch = resolve;
    });
    const stale = [];
    const deps = { now: () => now, search: () => pending };
    const first = profileAutocomplete(auto('stale-old', VIEWER, 'pl', async (choices) => {
        stale.push(['old', choices]);
    }, now), deps);
    const second = profileAutocomplete(auto('stale-new', VIEWER, 'plxn', async (choices) => {
        stale.push(['new', choices]);
    }, now), deps);
    resolveSearch([{ userId: PUBLIC, discoverable: true, nameLabel: 'PLXN' }]);
    await Promise.all([first, second]);
    assert.deepEqual(stale, [['new', [{ name: 'PLXN', value: PUBLIC }]]]);
});

test('an unknown autocomplete interaction is not logged', async () => {
    resetAutocomplete();
    const logs = [];
    const original = console.error;
    console.error = (line) => logs.push(String(line));
    try {
        const error = new Error('DiscordAPIError[10062]');
        error.code = 10062;
        await profileAutocomplete(auto('quiet', VIEWER, 'plxn', async () => {
            throw error;
        }), {
            search: async () => [{ userId: PUBLIC, discoverable: true, nameLabel: 'PLXN' }],
        });
        assert.equal(logs.length, 0);
    } finally {
        console.error = original;
    }
});
