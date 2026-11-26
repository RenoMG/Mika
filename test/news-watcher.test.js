const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PermissionFlagsBits } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const { parseFeed } = require('../src/blog/feed');
const sources = require('../src/news/sources');
const settings = require('../src/news/settings');
const post = require('../src/news/post');
const { createNewsWatcher, MAX_POSTS_PER_CHECK } = require('../src/news/watcher');

const GUILD = '300000000000000191';
const GUILD2 = '300000000000000192';
const CHANNEL = '123456789012345791';
const ROLE = '223456789012345791';
const NOW = Date.parse('2026-11-26T12:00:00Z');
const at = (minutesAgo) => NOW - minutesAgo * 60000;

// A feed shaped like the real ones: each story has a link under a section path and categories.
function rss(items, { title = 'Feed', link = 'https://news.example.com/' } = {}) {
    const body = items.map((item) => `<item><title>${item.title}</title><link>${item.link}</link>`
        + `<guid>${item.id || item.link}</guid><pubDate>${new Date(item.at).toUTCString()}</pubDate>`
        + `${(item.categories || []).map((category) => `<category><![CDATA[${category}]]></category>`).join('')}`
        + `<description><![CDATA[<p>${item.title} body text that is long enough to read.</p>]]></description></item>`).join('');
    return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><link>${link}</link>${body}</channel></rss>`;
}

const cr = (slug, minutesAgo, kind = 'latest') => ({ title: slug, link: `https://crunchyroll.com/news/${kind}/2026/11/26/${slug}`, at: at(minutesAgo), categories: [kind === 'latest' ? 'Latest News' : 'Features'] });
const corner = (slug, minutesAgo, categories = ['Anime News', 'News']) => ({ title: slug, link: `https://animecorner.me/${slug}/`, at: at(minutesAgo), categories });

// ---------------------------------------------------------------- filtering

test('each site keeps only its news: reviews, interviews, features, and quizzes are skipped', () => {
    const check = (id, item) => sources.sourceOf(id).isNews(item);
    assert.equal(check('crunchyroll', cr('new-anime', 1)), true);
    assert.equal(check('crunchyroll', cr('why-you-should-watch', 1, 'features')), false);
    assert.equal(check('crunchyroll', cr('cast-talk', 1, 'interviews')), false);
    assert.equal(check('crunchyroll', cr('puzzles', 1, 'quizzes')), false);

    assert.equal(check('ann', { link: 'https://www.animenewsnetwork.com/news/2026-11-26/new-anime/.1', categories: ['Anime'] }), true);
    assert.equal(check('ann', { link: 'https://www.animenewsnetwork.com/interest/2026-11-26/fun/.2', categories: ['Interest'] }), true);
    assert.equal(check('ann', { link: 'https://www.animenewsnetwork.com/review/show/episode-1/.3', categories: ['Review'] }), false);
    assert.equal(check('ann', { link: 'https://www.animenewsnetwork.com/feature/2026-11-26/talk/.4', categories: ['Feature'] }), false);

    assert.equal(check('animecorner', corner('anime-announced', 1)), true);
    assert.equal(check('animecorner', corner('artist-interview', 1, ['Manga', 'Interview'])), false);
    assert.equal(check('animecorner', corner('rankings-week-7', 1, ['Rankings', 'Anime of the Week'])), false);
    assert.equal(check('animecorner', corner('expo', 1, ['Events'])), false, 'no news tag, no post');

    assert.equal(check('anitrendz', { link: 'https://anitrendz.net/news/2026/11/26/x/', categories: ['News', 'Anime'] }), true);
    assert.equal(check('anitrendz', { link: 'https://anitrendz.net/news/2026/11/26/y/', categories: ['News', 'Reviews'] }), false);
    assert.equal(check('mal', { link: 'https://myanimelist.net/news/74984947', categories: [] }), true);
});

test('links lose tracking tags, and MyAnimeList thumbnails are found', () => {
    assert.equal(sources.cleanLink('https://anitrendz.net/news/x/?utm_source=rss&utm_medium=rss'), 'https://anitrendz.net/news/x/');
    assert.equal(sources.cleanLink('https://myanimelist.net/news/1?_location=rss'), 'https://myanimelist.net/news/1');
    const feed = parseFeed('<rss version="2.0"><channel><title>News - MyAnimeList</title><link>https://myanimelist.net/news</link>'
        + '<item><guid>https://myanimelist.net/news/1</guid><title>&#039;Show&#039; Gets Anime</title><link>https://myanimelist.net/news/1</link>'
        + '<media:thumbnail>https://cdn.myanimelist.net/s/a.jpeg</media:thumbnail><pubDate>Thu, 26 Nov 2026 09:17:50 -0800</pubDate></item></channel></rss>');
    assert.equal(feed.items[0].image, 'https://cdn.myanimelist.net/s/a.jpeg');
    assert.equal(feed.items[0].title, '\'Show\' Gets Anime');
});

test('followed sites: the defaults until a server picks its own, then exactly its picks', () => {
    assert.deepEqual(settings.newsSources({}), sources.DEFAULT_SOURCE_IDS);
    assert.deepEqual(sources.DEFAULT_SOURCE_IDS, ['crunchyroll', 'ann']);
    assert.deepEqual(settings.newsSources({ NewsSources: [] }), [], 'an empty pick means none');
    assert.deepEqual(settings.newsSources({ NewsSources: [{ Source: 'mal' }, { Source: 'gone' }, { Source: 'crunchyroll' }] }), ['crunchyroll', 'mal']);
});

test('the news message: line above, site-coloured embed, read button, and only the chosen role pinged', () => {
    const source = sources.sourceOf('crunchyroll');
    const feed = parseFeed(rss([cr('killer-shark', 5)], { title: 'Latest Anime News', link: 'https://crunchyroll.com/news' }));
    const message = post.newsMessage(source, feed, feed.items[0], { template: settings.DEFAULT_NEWS_MESSAGE, roleId: ROLE });
    assert.equal(message.content, `<@&${ROLE}> 📰 New anime news from **Crunchyroll News**!`);
    assert.deepEqual(message.allowedMentions, { parse: [], users: [], roles: [ROLE], repliedUser: false });
    const embed = message.embeds[0].toJSON();
    assert.equal(embed.color, source.color);
    assert.equal(embed.author.name, '🍥 Crunchyroll News');
    assert.equal(embed.title, 'killer-shark');
    assert.equal(embed.url, 'https://crunchyroll.com/news/latest/2026/11/26/killer-shark');
    assert.equal(embed.footer.text, 'Crunchyroll News', 'the "Latest News" section name is not shown as a topic');
    const button = message.components[0].toJSON().components[0];
    assert.equal(button.label, 'Read on Crunchyroll News');
    assert.equal(button.url, embed.url);

    const custom = post.newsMessage(source, feed, feed.items[0], { template: '{source} · {title} {link}' });
    assert.equal(custom.content, 'Crunchyroll News · killer-shark <https://crunchyroll.com/news/latest/2026/11/26/killer-shark>');
    assert.deepEqual(custom.allowedMentions.roles, []);
});

// ---------------------------------------------------------------- watching

function harness({ feeds = {}, configs = {}, canPost = true, failSend = 0 } = {}) {
    let now = NOW;
    const state = new Map();
    const sent = [];
    const logs = [];
    const fetches = [];
    let failures = failSend;
    const channel = {
        id: CHANNEL,
        permissionsFor: () => ({ has: (bit) => canPost || bit === PermissionFlagsBits.ViewChannel }),
        async send(payload) {
            if (failures > 0) { failures -= 1; throw new Error('Discord is down'); }
            sent.push(payload);
        },
    };
    const base = {
        NewsStatus: [{ Status: 'true' }],
        NewsChannel: [{ Channel: CHANNEL }],
        NewsMessage: [{ Message: '' }],
        NewsRole: [{ Role: '' }],
        NewsSources: [{ Source: 'crunchyroll' }, { Source: 'animecorner' }],
    };
    const guildConfigs = new Map([[GUILD, { ...base, ...(configs[GUILD] || {}) }], [GUILD2, { ...base, ...(configs[GUILD2] || {}) }]]);
    const byUrl = new Map(sources.SOURCES.map((source) => [source.feed, source.id]));
    const watcher = createNewsWatcher({
        fetch: async (url) => {
            const id = byUrl.get(url);
            fetches.push(id);
            if (!feeds[id]) throw new Error('down');
            return { body: rss(feeds[id]), etag: '', lastModified: '' };
        },
        store: {
            get: async (id) => state.get(id) || null,
            save: async (id, fields) => state.set(id, { ...(state.get(id) || { GuildID: id }), ...fields }),
        },
        readConfig: async (id) => guildConfigs.get(id),
        loadEnabled: async () => [GUILD, GUILD2],
        now: () => now,
        setTimer: () => null,
        clearTimer: () => {},
        log: (...args) => logs.push(args.join(' ')),
    });
    watcher.start({ user: { id: 'bot' }, channels: { cache: new Map([[CHANNEL, channel]]) }, guilds: { cache: new Map([[GUILD, {}], [GUILD2, {}]]) } });
    return {
        watcher, sent, logs, state, fetches, feeds, guildConfigs,
        advance: (ms) => { now += ms; },
        titles: () => sent.map((payload) => payload.embeds[0].toJSON().title),
    };
}

test('the first check only records each site, then new news is sent once and non-news never', async () => {
    const h = harness({ feeds: { crunchyroll: [cr('old-news', 60)], animecorner: [corner('old-corner', 90)] } });
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 0, seeded: 2 });
    assert.equal(h.sent.length, 0);

    h.feeds.crunchyroll.unshift(cr('big-announcement', 2), cr('a-feature', 3, 'features'));
    h.feeds.animecorner.unshift(corner('an-interview', 4, ['Interview']), corner('new-trailer', 5));
    h.advance(10 * 60000);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 2, waiting: 0, seeded: 0 });
    assert.deepEqual(h.titles(), ['new-trailer', 'big-announcement'], 'news only, oldest first across sites');
    assert.equal(h.sent[0].content, '📰 New anime news from **Anime Corner**!');

    h.advance(10 * 60000);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 0, seeded: 0 });
    assert.equal(h.sent.length, 2, 'never twice');
});

test('servers checked in one pass share a single fetch of each site', async () => {
    const h = harness({ feeds: { crunchyroll: [cr('a', 60)], animecorner: [corner('b', 60)] } });
    await h.watcher.runAll();
    assert.deepEqual(h.fetches.sort(), ['animecorner', 'crunchyroll']);
    h.advance(10 * 60000);
    await h.watcher.runAll();
    assert.equal(h.fetches.length, 4, 'the next pass reads again');
});

test(`a burst posts ${MAX_POSTS_PER_CHECK} at a time and the rest wait for the next pass`, async () => {
    const h = harness({ feeds: { crunchyroll: [cr('seed', 600)], animecorner: [corner('seed-c', 600)] } });
    await h.watcher.check(GUILD);
    for (let index = 1; index <= 7; index += 1) h.feeds.crunchyroll.unshift(cr(`story-${index}`, 60 - index));
    h.advance(10 * 60000);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: MAX_POSTS_PER_CHECK, waiting: 2, seeded: 0 });
    h.advance(10 * 60000);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 2, waiting: 0, seeded: 0 });
    assert.deepEqual(h.titles(), ['story-1', 'story-2', 'story-3', 'story-4', 'story-5', 'story-6', 'story-7']);
});

test('old news is recorded silently, and a failed send is retried', async () => {
    const h = harness({ feeds: { crunchyroll: [cr('seed', 600)], animecorner: [corner('seed-c', 600)] }, failSend: 1 });
    await h.watcher.check(GUILD);
    h.feeds.crunchyroll.unshift(cr('fresh', 5), cr('resurfaced', 4 * 24 * 60));
    h.advance(10 * 60000);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 1, seeded: 0 });
    assert.equal(h.logs.length, 1);
    h.advance(10 * 60000);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 1, waiting: 0, seeded: 0 });
    assert.deepEqual(h.titles(), ['fresh']);
});

test('adding a site starts fresh, dropping one forgets it, and an unreachable site is skipped', async () => {
    const h = harness({ feeds: { crunchyroll: [cr('seed', 60)], animecorner: [corner('seed-c', 60)], mal: undefined } });
    await h.watcher.check(GUILD);
    h.guildConfigs.get(GUILD).NewsSources = [{ Source: 'crunchyroll' }, { Source: 'mal' }];
    h.advance(10 * 60000);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 0, seeded: 0 });
    assert.deepEqual(h.state.get(GUILD).Sources.map((entry) => entry.Source), ['crunchyroll'], 'Anime Corner dropped; MAL not read yet');
    assert.match(h.logs[0], /could not read MyAnimeList News/);

    h.feeds.mal = [{ title: 'mal-old', link: 'https://myanimelist.net/news/1', at: at(5) }];
    h.advance(10 * 60000);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 0, seeded: 1 }, 'a newly followed site does not flood');
    assert.equal(h.sent.length, 0);
});

test('switching Anime News off forgets what was seen; a missing channel posts nothing', async () => {
    const h = harness({ feeds: { crunchyroll: [cr('seed', 60)], animecorner: [corner('seed-c', 60)] } });
    await h.watcher.check(GUILD);
    h.guildConfigs.get(GUILD).NewsStatus = [{ Status: 'false' }];
    assert.deepEqual(await h.watcher.check(GUILD), { skipped: 'off' });
    assert.deepEqual(h.state.get(GUILD).Sources, []);
    h.guildConfigs.get(GUILD2).NewsChannel = [{ Channel: '' }];
    assert.deepEqual(await h.watcher.check(GUILD2), { skipped: 'channel' });
});

test('missing channel permissions keep news waiting and log once', async () => {
    const h = harness({ feeds: { crunchyroll: [cr('seed', 60)], animecorner: [corner('seed-c', 60)] }, canPost: false });
    await h.watcher.check(GUILD);
    h.feeds.crunchyroll.unshift(cr('news', 1));
    h.advance(10 * 60000);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 1, seeded: 0 });
    h.advance(10 * 60000);
    await h.watcher.check(GUILD);
    assert.equal(h.logs.filter((line) => /channel/.test(line)).length, 1);
});

test('the preview is the newest news from the followed sites, and never pings', async () => {
    const h = harness({ feeds: { crunchyroll: [cr('a-feature', 1, 'features'), cr('cr-news', 30)], animecorner: [corner('corner-news', 10)] } });
    const config = { ...h.guildConfigs.get(GUILD), NewsRole: [{ Role: ROLE }] };
    const { payload } = await h.watcher.preview(config);
    assert.equal(payload.embeds[0].toJSON().title, 'corner-news');
    assert.equal(payload.content, `<@&${ROLE}> 📰 New anime news from **Anime Corner**!`);
    assert.deepEqual(payload.allowedMentions.roles, []);
    assert.match((await h.watcher.preview({ ...config, NewsSources: [] })).error, /Pick at least one/);
    assert.match((await h.watcher.preview({ ...config, NewsSources: [{ Source: 'ann' }] })).error, /couldn't reach Anime News Network/);
});
