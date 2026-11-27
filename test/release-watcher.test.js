const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PermissionFlagsBits } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const anilist = require('../src/releases/anilist');
const sources = require('../src/releases/sources');
const settings = require('../src/releases/settings');
const post = require('../src/releases/post');
const { createReleaseWatcher, MAX_POSTS_PER_CHECK } = require('../src/releases/watcher');

const GUILD = '300000000000000291';
const GUILD2 = '300000000000000292';
const CHANNEL = '123456789012345891';
const ROLE = '223456789012345891';
const NOW = Date.parse('2026-11-27T15:00:00Z');
const at = (minutesAgo) => NOW - minutesAgo * 60000;

let nextId = 1000;
// An airing schedule entry shaped like AniList's answer.
function airing({ show = 1, title = `Show ${show}`, episode = 2, episodes = 12, popularity = 30000, minutesAgo = 5, adult = false, format = 'TV', streams = [] } = {}) {
    nextId += 1;
    return {
        id: nextId,
        episode,
        airingAt: Math.floor(at(minutesAgo) / 1000),
        media: {
            id: show, isAdult: adult, format, episodes, popularity,
            siteUrl: `https://anilist.co/anime/${show}`,
            genres: adult ? ['Hentai'] : ['Action', 'Fantasy'],
            title: { romaji: `${title} (romaji)`, english: title, native: 'アニメ' },
            coverImage: { large: `https://s4.anilist.co/cover/${show}.jpg`, color: '#e4a15d' },
            bannerImage: `https://s4.anilist.co/banner/${show}.jpg`,
            studios: { nodes: [{ name: 'Studio Mika' }] },
            nextAiringEpisode: episodes && episode < episodes ? { episode: episode + 1, airingAt: Math.floor((NOW + 7 * 864e5) / 1000) } : null,
            externalLinks: [
                { site: 'Official Site', url: 'https://example.jp/', type: 'INFO', isDisabled: false },
                ...streams.map((site) => ({ site, url: `https://${site.toLowerCase()}.example.com/${show}`, type: 'STREAMING', isDisabled: false })),
            ],
        },
    };
}

function scheduleFeed(schedules) {
    return { title: 'AniList', link: 'https://anilist.co/', items: schedules.map(anilist.itemOf).filter(Boolean) };
}

// ---------------------------------------------------------------- reading AniList

test('AniList airings become items; adult shows are dropped', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push(JSON.parse(options.body).variables);
        const page = JSON.parse(options.body).variables.page;
        const body = page === 1
            ? { data: { Page: { pageInfo: { hasNextPage: true }, airingSchedules: [airing({ show: 7, streams: ['Crunchyroll'] }), airing({ show: 8, adult: true })] } } }
            : { data: { Page: { pageInfo: { hasNextPage: false }, airingSchedules: [airing({ show: 9, episode: 1 })] } } };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const feed = await anilist.fetchAiring({ from: 1, to: 2 }, { fetchImpl });
    assert.deepEqual(calls.map((entry) => entry.page), [1, 2]);
    assert.deepEqual(feed.items.map((item) => item.mediaId), ['7', '9']);
    const item = feed.items[0];
    assert.equal(item.title, 'Show 7');
    assert.equal(item.color, 0xE4A15D);
    assert.equal(item.studio, 'Studio Mika');
    assert.deepEqual(item.streams, [{ site: 'Crunchyroll', url: 'https://crunchyroll.example.com/7' }]);

    const failing = async () => new Response(JSON.stringify({ errors: [{ message: 'Too Many Requests' }] }), { status: 200 });
    await assert.rejects(anilist.fetchAiring({ from: 1, to: 2 }, { fetchImpl: failing }), /Too Many Requests/);
});

test('each release type picks its episodes', () => {
    const match = (id, schedule) => sources.sourceOf(id).matches(anilist.itemOf(schedule));
    assert.equal(match('premieres', airing({ episode: 1 })), true);
    assert.equal(match('premieres', airing({ episode: 2 })), false);
    assert.equal(match('popular', airing({ popularity: 25000 })), true);
    assert.equal(match('popular', airing({ popularity: 400 })), false);
    assert.equal(match('finales', airing({ episode: 12, episodes: 12 })), true);
    assert.equal(match('finales', airing({ episode: 11, episodes: 12 })), false);
    assert.equal(match('finales', airing({ episode: 1, episodes: 1, format: 'MOVIE' })), false, 'a movie is not a finale');
    assert.equal(match('finales', airing({ episode: 30, episodes: null })), false, 'unknown length, unknown finale');
    assert.equal(match('all', airing({ popularity: 10 })), true);
});

test('followed release types: the defaults until a server picks its own', () => {
    assert.deepEqual(settings.releaseSources({}), ['premieres', 'popular']);
    assert.deepEqual(settings.releaseSources({ ReleaseSources: [] }), []);
    assert.deepEqual(settings.releaseSources({ ReleaseSources: [{ Source: 'all' }, { Source: 'gone' }, { Source: 'finales' }] }), ['finales', 'all']);
});

test('the release message: line above, show embed, AniList and streaming buttons, and only the chosen role pinged', () => {
    const source = sources.sourceOf('popular');
    const feed = scheduleFeed([airing({ show: 5, title: 'Frieren', episode: 9, streams: ['Crunchyroll', 'Netflix', 'Crunchyroll'] })]);
    const message = post.releaseMessage(source, feed, feed.items[0], { template: settings.DEFAULT_RELEASE_MESSAGE, roleId: ROLE });
    assert.equal(message.content, `<@&${ROLE}> 📺 **Frieren**: Episode 9 just dropped!`);
    assert.deepEqual(message.allowedMentions, { parse: [], users: [], roles: [ROLE], repliedUser: false });
    const embed = message.embeds[0].toJSON();
    assert.equal(embed.author.name, '📺 New episode');
    assert.equal(embed.title, 'Frieren — Episode 9');
    assert.equal(embed.url, 'https://anilist.co/anime/5');
    assert.equal(embed.color, 0xE4A15D);
    assert.match(embed.description, /Frieren \(romaji\) · アニメ/);
    assert.deepEqual(embed.fields.map((field) => field.name), ['Episode', 'Studio', 'Next episode']);
    assert.equal(embed.fields[0].value, '9 / 12');
    assert.match(embed.fields[2].value, /^Ep 10 <t:\d+:R>$/);
    assert.equal(embed.thumbnail.url, 'https://s4.anilist.co/cover/5.jpg');
    assert.equal(embed.image.url, 'https://s4.anilist.co/banner/5.jpg');
    const buttons = message.components[0].toJSON().components.map((button) => button.label);
    assert.deepEqual(buttons, ['View on AniList', 'Watch on Crunchyroll', 'Watch on Netflix'], 'one button per site');

    const premiere = scheduleFeed([airing({ episode: 1 })]).items[0];
    assert.equal(post.kindOf(premiere).label, 'Series premiere');
    const movie = scheduleFeed([airing({ episode: 1, episodes: 1, format: 'MOVIE' })]).items[0];
    assert.equal(post.kindOf(movie).label, 'Movie release');
    assert.equal(post.releaseEmbed(source, feed, movie).toJSON().title, 'Show 1 — The movie');
    const finale = scheduleFeed([airing({ episode: 12, episodes: 12 })]).items[0];
    assert.equal(post.kindOf(finale).label, 'Season finale');
    const custom = post.releaseMessage(source, feed, finale, { template: '{type}: {title} ({episode}) {link}' });
    assert.equal(custom.content, 'Season finale: Show 1 (Episode 12) <https://anilist.co/anime/1>');
    assert.equal(custom.embeds[0].toJSON().fields.find((field) => field.name === 'Next episode').value, 'That\'s the last one!');
});

test('LiveChart items read the episode number from the title', () => {
    const item = { id: 'lc1', title: 'Dandadan #8', link: 'https://www.livechart.me/anime/1', published: new Date(at(5)) };
    assert.deepEqual(post.episodeOf(item), { title: 'Dandadan', from: 8, to: 8 });
    const message = post.releaseMessage(sources.sourceOf('livechart'), {}, item, { template: settings.DEFAULT_RELEASE_MESSAGE });
    assert.equal(message.content, '📺 **Dandadan**: Episode 8 just dropped!');
    assert.equal(message.components[0].toJSON().components[0].label, 'View on LiveChart.me');
});

// ---------------------------------------------------------------- watching

// The 2-minute shared cache is off unless a test is about it.
function harness({ schedules = [], configs = {}, canPost = true, failSend = 0, anilistDown = false, feedMaxAgeMs = 0 } = {}) {
    let now = NOW;
    const state = new Map();
    const sent = [];
    const logs = [];
    let fetches = 0;
    let failures = failSend;
    const list = { schedules, down: anilistDown };
    const channel = {
        id: CHANNEL,
        permissionsFor: () => ({ has: (bit) => canPost || bit === PermissionFlagsBits.ViewChannel }),
        async send(payload) {
            if (failures > 0) { failures -= 1; throw new Error('Discord is down'); }
            sent.push(payload);
        },
    };
    const base = {
        ReleaseStatus: [{ Status: 'true' }],
        ReleaseChannel: [{ Channel: CHANNEL }],
        ReleaseMessage: [{ Message: '' }],
        ReleaseRole: [{ Role: '' }],
        ReleaseSources: [{ Source: 'premieres' }, { Source: 'popular' }],
    };
    const guildConfigs = new Map([[GUILD, { ...base, ...(configs[GUILD] || {}) }], [GUILD2, { ...base, ...(configs[GUILD2] || {}) }]]);
    const watcher = createReleaseWatcher({
        fetchSchedule: async () => {
            fetches += 1;
            if (list.down) throw new Error('AniList answered 503');
            return scheduleFeed([...list.schedules].sort((a, b) => b.airingAt - a.airingAt));
        },
        fetch: async () => { throw new Error('down'); },
        store: {
            get: async (id) => state.get(id) || null,
            save: async (id, fields) => state.set(id, { ...(state.get(id) || { GuildID: id }), ...fields }),
        },
        readConfig: async (id) => guildConfigs.get(id),
        loadEnabled: async () => [GUILD, GUILD2],
        now: () => now,
        setTimer: () => null,
        clearTimer: () => {},
        feedMaxAgeMs,
        log: (...args) => logs.push(args.join(' ')),
    });
    watcher.start({ user: { id: 'bot' }, channels: { cache: new Map([[CHANNEL, channel]]) }, guilds: { cache: new Map([[GUILD, {}], [GUILD2, {}]]) } });
    return {
        watcher, sent, logs, state, list, guildConfigs,
        get fetches() { return fetches; },
        advance: (ms) => { now += ms; },
        titles: () => sent.map((payload) => payload.embeds[0].toJSON().title),
    };
}

test('the first check only records, then new releases go out once, and unfollowed ones never', async () => {
    const h = harness({ schedules: [airing({ show: 1, minutesAgo: 60 })] });
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 0, seeded: 2 });
    h.list.schedules.push(
        airing({ show: 2, title: 'Premiere', episode: 1, popularity: 50, minutesAgo: 3 }),
        airing({ show: 3, title: 'Hit', episode: 6, minutesAgo: 2 }),
        airing({ show: 4, title: 'Obscure', episode: 6, popularity: 50, minutesAgo: 1 }),
    );
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 2, waiting: 0, seeded: 0 });
    assert.deepEqual(h.titles(), ['Premiere — Episode 1', 'Hit — Episode 6'], 'oldest first');
    assert.equal(h.sent[0].embeds[0].toJSON().author.name, '🆕 Series premiere');
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 0, seeded: 0 });
    assert.equal(h.sent.length, 2, 'never twice');
});

test('an episode that fits two followed types is posted once', async () => {
    const h = harness({ schedules: [airing({ show: 1, minutesAgo: 60 })] });
    await h.watcher.check(GUILD);
    h.list.schedules.push(airing({ show: 2, title: 'Big premiere', episode: 1, popularity: 90000, minutesAgo: 1 }));
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 1, waiting: 0, seeded: 0 });
    assert.deepEqual(h.titles(), ['Big premiere — Episode 1']);
    assert.equal((await h.watcher.check(GUILD)).posted, 0);
});

test('a whole season dropped at once is one post', async () => {
    const h = harness({ schedules: [airing({ show: 1, minutesAgo: 60 })] });
    await h.watcher.check(GUILD);
    for (let episode = 1; episode <= 12; episode += 1) h.list.schedules.push(airing({ show: 9, title: 'Fool Night', episode, minutesAgo: 2, streams: ['Netflix'] }));
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 1, waiting: 0, seeded: 0 });
    const embed = h.sent[0].embeds[0].toJSON();
    assert.equal(embed.title, 'Fool Night — Episodes 1–12');
    assert.equal(embed.author.name, '🆕 New series, all at once');
    assert.equal(embed.fields[0].value, '1–12 / 12');
    assert.equal(h.sent[0].content, '📺 **Fool Night**: Episodes 1–12 just dropped!');
    assert.equal((await h.watcher.check(GUILD)).posted, 0);
});

test(`a burst posts ${MAX_POSTS_PER_CHECK} at a time; the rest wait; late and stale airings are skipped`, async () => {
    const h = harness({ schedules: [airing({ show: 1, minutesAgo: 170 })] });
    await h.watcher.check(GUILD);
    for (let show = 10; show < 17; show += 1) h.list.schedules.push(airing({ show, title: `S${show}`, minutesAgo: 40 - show }));
    h.list.schedules.push(airing({ show: 30, title: 'Too late', minutesAgo: 4 * 60 }));
    assert.deepEqual(await h.watcher.check(GUILD), { posted: MAX_POSTS_PER_CHECK, waiting: 2, seeded: 0 });
    h.advance(10 * 60000);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 2, waiting: 0, seeded: 0 });
    assert.deepEqual(h.titles(), ['S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16'].map((name) => `${name} — Episode 2`));
});

test('a failed send is retried, and missing permissions log once', async () => {
    const h = harness({ schedules: [airing({ show: 1, minutesAgo: 60 })], failSend: 1 });
    await h.watcher.check(GUILD);
    h.list.schedules.push(airing({ show: 2, title: 'Retry me', minutesAgo: 1 }));
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 1, seeded: 0 });
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 1, waiting: 0, seeded: 0 });

    const blocked = harness({ schedules: [airing({ show: 1, minutesAgo: 60 })], canPost: false });
    await blocked.watcher.check(GUILD);
    blocked.list.schedules.push(airing({ show: 2, minutesAgo: 1 }));
    await blocked.watcher.check(GUILD);
    await blocked.watcher.check(GUILD);
    assert.equal(blocked.logs.filter((line) => /release channel/.test(line)).length, 1);
});

test('servers in one pass share one AniList request for every type', async () => {
    const h = harness({ schedules: [airing({ show: 1, minutesAgo: 60 })], configs: { [GUILD2]: { ReleaseSources: [{ Source: 'all' }, { Source: 'finales' }] } }, feedMaxAgeMs: 120000 });
    await h.watcher.runAll();
    assert.equal(h.fetches, 1);
    h.advance(10 * 60000);
    await h.watcher.runAll();
    assert.equal(h.fetches, 2);
});

test('switching off forgets what was seen; AniList being down is logged once and kept', async () => {
    const h = harness({ schedules: [airing({ show: 1, minutesAgo: 60 })] });
    await h.watcher.check(GUILD);
    h.list.down = true;
    h.advance(10 * 60000);
    await h.watcher.check(GUILD);
    h.advance(10 * 60000);
    await h.watcher.check(GUILD);
    assert.equal(h.logs.filter((line) => /could not read AniList/.test(line)).length, 1);
    assert.equal(h.state.get(GUILD).Sources.length, 2, 'what was seen is kept while AniList is down');
    h.guildConfigs.get(GUILD).ReleaseStatus = [{ Status: 'false' }];
    assert.deepEqual(await h.watcher.check(GUILD), { skipped: 'off' });
    assert.deepEqual(h.state.get(GUILD).Sources, []);
});

test('the preview is the latest followed release, and never pings', async () => {
    const h = harness({ schedules: [airing({ show: 1, title: 'Older hit', minutesAgo: 60 }), airing({ show: 2, title: 'Newer obscure', popularity: 5, minutesAgo: 5 })] });
    const config = { ...h.guildConfigs.get(GUILD), ReleaseRole: [{ Role: ROLE }] };
    const { payload } = await h.watcher.preview(config);
    assert.equal(payload.embeds[0].toJSON().title, 'Older hit — Episode 2');
    assert.equal(payload.content, `<@&${ROLE}> 📺 **Older hit**: Episode 2 just dropped!`);
    assert.deepEqual(payload.allowedMentions.roles, []);
    assert.match((await h.watcher.preview({ ...config, ReleaseSources: [] })).error, /Pick at least one/);
    assert.match((await h.watcher.preview({ ...config, ReleaseSources: [{ Source: 'finales' }] })).error, /Nothing you follow has aired/);
});
