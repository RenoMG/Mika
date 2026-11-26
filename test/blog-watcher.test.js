const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PermissionFlagsBits } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const feed = require('../src/blog/feed');
const post = require('../src/blog/post');
const settings = require('../src/blog/settings');
const { createWatcher, MAX_POSTS_PER_CHECK } = require('../src/blog/watcher');

const RENOS_WORLD = fs.readFileSync(path.join(__dirname, 'fixtures', 'renos-world-feed.xml'), 'utf8');
const GUILD = '300000000000000091';
const CHANNEL = '123456789012345691';
const ROLE = '223456789012345691';
const PUBLIC_DNS = async () => [{ address: '93.184.216.34', family: 4 }];

function rss(items, { title = 'Test Blog', link = 'https://blog.example.com/' } = {}) {
    const body = items.map((item) => `<item><title>${item.title}</title><link>${link}${item.id}/</link>`
        + `<guid isPermaLink="false">${item.id}</guid><pubDate>${new Date(item.at).toUTCString()}</pubDate>`
        + `<dc:creator><![CDATA[Reno]]></dc:creator><description><![CDATA[<p>${item.title} body text.</p>]]></description></item>`).join('');
    return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><link>${link}</link>${body}</channel></rss>`;
}

// ---------------------------------------------------------------- parsing

test('the renos.world feed parses: titles, links, author, categories, and cover images', () => {
    const parsed = feed.parseFeed(RENOS_WORLD);
    assert.equal(parsed.title, "Reno's World");
    assert.equal(parsed.link, 'https://renos.world/');
    // The 32x32 site icon is swapped for the full-size image.
    assert.equal(parsed.icon, 'https://renos.world/wp-content/uploads/2025/10/cropped-5a4e299d7d70aace-1.jpg');
    assert.equal(parsed.items.length, 3);
    const [review, trip, update] = parsed.items;
    assert.equal(review.id, 'https://renos.world/?p=642');
    assert.equal(review.title, 'I Made Friends with the Second Prettiest Girl in My Class – Review');
    assert.equal(review.author, 'Reno');
    assert.deepEqual(review.categories.slice(0, 2), ['Anime', 'Reviews']);
    assert.match(review.image, /^https:\/\/renos\.world\/wp-content\/uploads\/2026\/11\/.+-1024x576\.jpg$/);
    assert.match(trip.title, /Solo Trip to Tokyo/);
    assert.equal(update.image, '', 'a post without pictures has no image');
    assert.ok(review.published > trip.published, 'newest first');
});

test('a review becomes Rating and Details fields; other posts keep a clean excerpt', () => {
    const parsed = feed.parseFeed(RENOS_WORLD);
    const [review, trip] = parsed.items;
    const { ratings, details } = post.reviewOf(review.html);
    assert.deepEqual(ratings.map((entry) => `${entry.name} ${entry.score}/${entry.out}`), ['Animation 6/10', 'Story 8/10', 'Voice Acting 8/10']);
    assert.deepEqual(details.map((entry) => entry.name), ['Watched on', 'Watched with dubs?', 'Release Date', 'Written by']);
    assert.equal(details[0].value, 'Crunchyroll');

    const excerpt = post.excerptOf(review);
    assert.match(excerpt, /^Just to start this short review off/);
    assert.ok(excerpt.length <= post.EXCERPT_MAX);
    assert.doesNotMatch(excerpt, /appeared first on/);

    assert.deepEqual(post.reviewOf(trip.html), { ratings: [], details: [] });
    assert.equal(post.kindEmoji(review.categories), '🎌');
    assert.equal(post.kindEmoji(trip.categories), '✈️');
    assert.ok(post.readingMinutes(trip.html) > 10);
});

test('the post message: custom line above, curated embed, read button, and only the chosen role pinged', () => {
    const parsed = feed.parseFeed(RENOS_WORLD);
    const [review, , update] = parsed.items;
    const message = post.postMessage(parsed, review, { template: settings.DEFAULT_BLOG_MESSAGE, roleId: ROLE });
    assert.equal(message.content, `<@&${ROLE}> 📝 **Reno** just posted on **Reno's World**!`);
    assert.deepEqual(message.allowedMentions, { parse: [], users: [], roles: [ROLE], repliedUser: false });

    const embed = message.embeds[0].toJSON();
    assert.equal(embed.color, post.BLOG_COLOR);
    assert.equal(embed.author.name, "Reno's World");
    assert.equal(embed.url, 'https://renos.world/i-made-friends-with-the-second-prettiest-girl-in-my-class-review/');
    assert.equal(embed.fields[0].name, '⭐ Rating');
    assert.match(embed.fields[0].value, /\*\*Story\*\* 8\/10/);
    assert.match(embed.fields[1].value, /\*\*Watched on:\*\* Crunchyroll/);
    assert.ok(embed.image.url);
    assert.match(embed.footer.text, /By Reno .+🎌 Anime · Reviews/);
    assert.ok(embed.timestamp);

    const buttons = message.components[0].toJSON().components;
    assert.equal(buttons[0].label, "Read on Reno's World");
    assert.equal(buttons[0].url, embed.url);
    assert.equal(buttons[1].url, 'https://renos.world/');

    // {link} is wrapped so Discord does not add a second preview, and markdown in titles is escaped.
    const custom = post.postMessage(parsed, { ...update, title: '**Big** news' }, { template: 'New: {title} {link} ({category})' });
    assert.equal(custom.content, 'New: \\*\\*Big\\*\\* news <https://renos.world/things-have-been-slow/> (Reno\'s World Updates)');
    assert.deepEqual(custom.allowedMentions.roles, []);
    assert.equal(custom.embeds[0].toJSON().fields, undefined, 'no review fields on a regular post');
});

test('Atom feeds (Blogger, Hashnode, many static sites) parse too', () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Blog</title>
        <link rel="alternate" href="https://atom.example.com/"/><icon>https://atom.example.com/icon.png</icon>
        <entry><id>tag:atom.example.com,2026:1</id><title>Hello &amp; welcome</title>
        <link rel="alternate" href="https://atom.example.com/hello"/><published>2026-11-20T10:00:00Z</published>
        <author><name>Kaz</name></author><category term="news"/>
        <content type="html">&lt;p&gt;First post&lt;/p&gt;&lt;img src="/cover.png" width="800"&gt;</content></entry></feed>`;
    const parsed = feed.parseFeed(atom);
    assert.equal(parsed.title, 'Atom Blog');
    assert.equal(parsed.items[0].title, 'Hello & welcome');
    assert.equal(parsed.items[0].link, 'https://atom.example.com/hello');
    assert.equal(parsed.items[0].author, 'Kaz');
    assert.deepEqual(parsed.items[0].categories, ['news']);
    assert.equal(parsed.items[0].image, 'https://atom.example.com/cover.png');
});

test('anything that is not a feed is refused, and home pages point to their feed', () => {
    assert.throws(() => feed.parseFeed('<html><body>hi</body></html>'), { reason: 'not-feed' });
    const html = `<link rel="alternate" type="application/rss+xml" title="Blog &raquo; Feed" href="https://renos.world/feed/" />
        <link rel="alternate" type="application/rss+xml" title="Blog &raquo; Comments Feed" href="https://renos.world/comments/feed/" />
        <link rel="alternate" type="application/atom+xml" href="/atom.xml">`;
    assert.deepEqual(feed.discoverFeedLinks(html, 'https://renos.world/'), ['https://renos.world/feed/', 'https://renos.world/atom.xml']);
});

// ---------------------------------------------------------------- fetching

test('feeds are only fetched from public addresses', async () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '192.168.0.4', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
        assert.equal(feed.isPrivateAddress(address), true, address);
    }
    assert.equal(feed.isPrivateAddress('93.184.216.34'), false);
    await assert.rejects(feed.assertPublicUrl('http://localhost/feed'), { reason: 'private' });
    await assert.rejects(feed.assertPublicUrl('http://169.254.169.254/latest'), { reason: 'private' });
    await assert.rejects(feed.assertPublicUrl('ftp://renos.world/feed'), { reason: 'invalid' });
    await assert.rejects(feed.assertPublicUrl('https://inside.example/feed', { lookup: async () => [{ address: '10.0.0.5' }] }), { reason: 'private' });
    await feed.assertPublicUrl('https://renos.world/feed/', { lookup: PUBLIC_DNS });
});

test('fetching sends validators, honours 304, and checks every redirect hop', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, headers: options.headers });
        if (url.endsWith('/old')) return new Response(null, { status: 301, headers: { location: 'https://renos.world/feed/' } });
        if (url.endsWith('/sneaky')) return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
        if (options.headers['if-none-match'] === '"v1"') return new Response(null, { status: 304 });
        return new Response(RENOS_WORLD, { status: 200, headers: { etag: '"v1"', 'content-type': 'application/rss+xml' } });
    };
    const first = await feed.fetchFeed('https://renos.world/old', { fetchImpl, lookup: PUBLIC_DNS });
    assert.equal(first.url, 'https://renos.world/feed/');
    assert.equal(first.etag, '"v1"');
    assert.equal(calls[0].headers['user-agent'], 'Mika Discord bot (Blog Watcher)');
    const second = await feed.fetchFeed(first.url, { etag: first.etag, fetchImpl, lookup: PUBLIC_DNS });
    assert.equal(second.notModified, true);
    await assert.rejects(feed.fetchFeed('https://renos.world/sneaky', { fetchImpl, lookup: PUBLIC_DNS }), { reason: 'private' });
});

test('a typed blog address finds its feed, from a feed link or a common path', async () => {
    const home = '<html><head><link rel="alternate" type="application/rss+xml" href="https://renos.world/feed/"></head></html>';
    const fetchImpl = async (url) => (url === 'https://renos.world/feed/'
        ? new Response(RENOS_WORLD, { status: 200 })
        : new Response(home, { status: 200, headers: { 'content-type': 'text/html' } }));
    const found = await feed.resolveFeedUrl('renos.world', { fetchImpl, lookup: PUBLIC_DNS });
    assert.equal(found.url, 'https://renos.world/feed/');
    assert.equal(found.feed.title, "Reno's World");

    // A Ghost blog without a feed link: /rss/ is tried.
    const ghost = async (url) => (url === 'https://ghost.example.com/rss/'
        ? new Response(rss([{ id: 'g1', title: 'Ghost post', at: Date.now() }]), { status: 200 })
        : new Response('not here', { status: 404 }));
    assert.equal((await feed.resolveFeedUrl('https://ghost.example.com', { fetchImpl: ghost, lookup: PUBLIC_DNS })).url, 'https://ghost.example.com/rss/');

    const nothing = async () => new Response('<html></html>', { status: 200 });
    await assert.rejects(feed.resolveFeedUrl('nofeed.example.com', { fetchImpl: nothing, lookup: PUBLIC_DNS }), { reason: 'not-feed' });
});

// ---------------------------------------------------------------- watching

function harness({ items, canPost = true, failSend = 0, config = {} } = {}) {
    let now = Date.parse('2026-11-26T12:00:00Z');
    const state = new Map();
    const sent = [];
    const logs = [];
    const feedState = { items, etag: '' };
    let failures = failSend;
    const channel = {
        id: CHANNEL,
        permissionsFor: () => ({ has: (bit) => canPost || bit === PermissionFlagsBits.ViewChannel }),
        async send(payload) {
            if (failures > 0) { failures -= 1; throw new Error('Discord is down'); }
            sent.push(payload);
        },
    };
    const guildConfig = {
        BlogStatus: [{ Status: 'true' }],
        BlogChannel: [{ Channel: CHANNEL }],
        BlogFeed: [{ URL: '' }],
        BlogMessage: [{ Message: '' }],
        BlogRole: [{ Role: '' }],
        ...config,
    };
    const fetches = [];
    const watcher = createWatcher({
        fetch: async (url, options = {}) => {
            fetches.push({ url, options });
            if (feedState.etag && options.etag === feedState.etag) return { notModified: true };
            return { body: rss(feedState.items), etag: feedState.etag, lastModified: '' };
        },
        store: {
            get: async (id) => state.get(id) || null,
            save: async (id, fields) => state.set(id, { ...(state.get(id) || { GuildID: id }), ...fields }),
        },
        readConfig: async () => guildConfig,
        loadEnabled: async () => [GUILD],
        now: () => now,
        setTimer: () => null,
        clearTimer: () => {},
        log: (...args) => logs.push(args.join(' ')),
    });
    watcher.start({ user: { id: 'bot' }, channels: { cache: new Map([[CHANNEL, channel]]) }, guilds: { cache: new Map([[GUILD, {}]]) } });
    return {
        watcher, sent, logs, state, fetches, feedState, guildConfig,
        advance: (ms) => { now += ms; },
        get now() { return now; },
    };
}

const at = (minutesAgo) => Date.parse('2026-11-26T12:00:00Z') - minutesAgo * 60000;

test('the first check only records the feed, then each new post is sent once', async () => {
    const h = harness({ items: [{ id: 'p2', title: 'Second', at: at(60) }, { id: 'p1', title: 'First', at: at(120) }] });
    assert.deepEqual(await h.watcher.check(GUILD), { seeded: 2 });
    assert.equal(h.sent.length, 0, 'turning it on does not post old entries');

    h.feedState.items.unshift({ id: 'p3', title: 'Third', at: at(1) });
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 1, waiting: 0 });
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].embeds[0].toJSON().title, 'Third');
    assert.equal(h.sent[0].content, '📝 **Reno** just posted on **Test Blog**!');

    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 0 });
    assert.equal(h.sent.length, 1, 'never twice');
    assert.equal(h.fetches.at(-1).url, settings.DEFAULT_BLOG_FEED);
});

test('an unchanged feed costs a conditional request and posts nothing', async () => {
    const h = harness({ items: [{ id: 'p1', title: 'First', at: at(10) }] });
    h.feedState.etag = '"v1"';
    await h.watcher.check(GUILD);
    assert.equal(h.state.get(GUILD).ETag, '"v1"');
    assert.deepEqual(await h.watcher.check(GUILD), { notModified: true });
    assert.equal(h.fetches.at(-1).options.etag, '"v1"');
});

test('a post that fails to send is retried on the next check, not lost', async () => {
    const h = harness({ items: [{ id: 'p1', title: 'First', at: at(30) }], failSend: 1 });
    await h.watcher.check(GUILD);
    h.feedState.items.unshift({ id: 'p2', title: 'Second', at: at(1) });
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 0, waiting: 1 });
    assert.equal(h.logs.length, 1);
    assert.deepEqual(await h.watcher.check(GUILD), { posted: 1, waiting: 0 });
    assert.equal(h.sent[0].embeds[0].toJSON().title, 'Second');
});

test('missing channel permissions keep posts waiting and log once', async () => {
    const h = harness({ items: [{ id: 'p1', title: 'First', at: at(30) }], canPost: false });
    await h.watcher.check(GUILD);
    h.feedState.items.unshift({ id: 'p2', title: 'Second', at: at(1) });
    await h.watcher.check(GUILD);
    await h.watcher.check(GUILD);
    assert.equal(h.sent.length, 0);
    assert.equal(h.logs.filter((line) => line.includes('(channel)')).length, 1);
    assert.ok(!h.state.get(GUILD).Seen.includes('p2'));
});

test('bursts are capped, old resurfaced posts are skipped, and a new feed starts fresh', async () => {
    const h = harness({ items: [{ id: 'p1', title: 'First', at: at(600) }] });
    await h.watcher.check(GUILD);
    const burst = Array.from({ length: 5 }, (_, index) => ({ id: `n${index}`, title: `New ${index}`, at: at(50 - index) }));
    h.feedState.items = [...burst, { id: 'old', title: 'Old', at: at(60 * 24 * 30) }, { id: 'p1', title: 'First', at: at(600) }];
    assert.deepEqual(await h.watcher.check(GUILD), { posted: MAX_POSTS_PER_CHECK, waiting: 0 });
    // The newest three, oldest of them first.
    assert.deepEqual(h.sent.map((payload) => payload.embeds[0].toJSON().title), ['New 2', 'New 3', 'New 4']);
    assert.ok(h.state.get(GUILD).Seen.includes('old'));

    // Pointing at another blog records it without posting its back catalogue.
    h.guildConfig.BlogFeed = [{ URL: 'https://other.example.com/feed/' }];
    h.feedState.items = [{ id: 'x1', title: 'Other', at: at(5) }];
    assert.deepEqual(await h.watcher.check(GUILD), { seeded: 1 });
    assert.equal(h.sent.length, 3);
});

test('a feed whose every entry changed id is re-read without posting', async () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ id: `a${index}`, title: `A ${index}`, at: at(index + 1) }));
    const h = harness({ items });
    await h.watcher.check(GUILD);
    h.feedState.items = items.map((item) => ({ ...item, id: `b${item.id}` }));
    assert.deepEqual(await h.watcher.check(GUILD), { reseeded: 6 });
    assert.equal(h.sent.length, 0);
});

test('switched off or without a channel, nothing is fetched; preview never pings', async () => {
    const h = harness({ items: [{ id: 'p1', title: 'First', at: at(5) }], config: { BlogRole: [{ Role: ROLE }] } });
    h.guildConfig.BlogStatus = [{ Status: 'false' }];
    assert.deepEqual(await h.watcher.check(GUILD), { skipped: 'off' });
    h.guildConfig.BlogStatus = [{ Status: 'true' }];
    h.guildConfig.BlogChannel = [{ Channel: '' }];
    assert.deepEqual(await h.watcher.check(GUILD), { skipped: 'channel' });
    assert.equal(h.fetches.length, 0);

    const { payload } = await h.watcher.preview(h.guildConfig);
    assert.match(payload.content, new RegExp(`^<@&${ROLE}>`), 'the ping is shown');
    assert.deepEqual(payload.allowedMentions.roles, [], 'but not sent');
});

test('settings fall back to renos.world and the built-in message', () => {
    assert.equal(settings.blogFeed({}), 'https://renos.world/feed/');
    assert.equal(settings.blogMessage({ BlogMessage: [{ Message: '' }] }), settings.DEFAULT_BLOG_MESSAGE);
    assert.equal(settings.blogEnabled({}), false);
    assert.equal(settings.blogRole({ BlogRole: [{ Role: ROLE }] }), ROLE);
});
