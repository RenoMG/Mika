// Anime News: every 10 minutes, reads the feeds of the news sites a server
// follows and posts the news it has not seen to that server's news channel.
//
// - Each site's feed is fetched once per pass and shared by every server, with
//   conditional requests (ETag / Last-Modified), so an unchanged feed is cheap.
// - Only items the site files as news are posted (see sources.js); reviews,
//   interviews, and features in the same feed are recorded and skipped.
// - The first time a server follows a site, what is already in its feed is only
//   recorded, so switching Anime News on, or adding a site, never floods.
// - At most 5 stories go out per pass, oldest first. The rest wait for the next
//   pass, as long as they are still fresh.
const { fetchFeed, parseFeed } = require('../blog/feed');
const { canPost } = require('../blog/watcher');
const { newsMessage: buildMessage } = require('./post');
const { SOURCES, cleanLink } = require('./sources');
const { newsChannel, newsEnabled, newsMessage, newsRole, newsSources } = require('./settings');
const { redact } = require('../utils/redact');
const { snowflake } = require('../utils/safeId');

const CHECK_INTERVAL_MS = 10 * 60000;
const FIRST_CHECK_MS = 45000;
const MAX_POSTS_PER_CHECK = 5;
const SEEN_LIMIT = 200;
// News older than this when Mika first sees it is not news any more.
const STALE_NEWS_MS = 2 * 24 * 60 * 60000;
// Servers checked in the same pass share one fetch of each feed.
const FEED_MAX_AGE_MS = 2 * 60000;

const mongoStore = {
    async get(guildId) {
        return require('../Models/NewsWatch').findOne({ GuildID: guildId }).lean();
    },
    async save(guildId, fields) {
        await require('../Models/NewsWatch').updateOne({ GuildID: guildId }, { $set: fields }, { upsert: true });
    },
};

async function loadEnabledGuilds() {
    const ConfigurationDB = require('../Models/ConfigurationDB');
    const docs = await ConfigurationDB.find({ 'NewsStatus.Status': 'true' }).select('GuildID').lean();
    return docs.map((doc) => snowflake(doc && doc.GuildID)).filter(Boolean);
}

async function readGuildConfig(guildId) {
    return require('../utils/getGuildConfig').getGuildConfig(guildId, { readOnly: true });
}

async function resolveChannel(client, channelId) {
    const cached = client?.channels?.cache?.get?.(channelId);
    if (cached) return cached;
    if (typeof client?.channels?.fetch !== 'function') return null;
    try {
        return await client.channels.fetch(channelId);
    } catch (error) {
        return null;
    }
}

// The feed's items with tracking tags removed from their links.
function cleanFeed(feed) {
    return { ...feed, items: feed.items.map((item) => ({ ...item, link: cleanLink(item.link) })) };
}

function createNewsWatcher({
    fetch = fetchFeed,
    store = mongoStore,
    readConfig = readGuildConfig,
    loadEnabled = loadEnabledGuilds,
    sources = SOURCES,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    intervalMs = CHECK_INTERVAL_MS,
    firstCheckMs = FIRST_CHECK_MS,
    feedMaxAgeMs = FEED_MAX_AGE_MS,
    log = (...args) => console.error(...args),
} = {}) {
    let client = null;
    let started = false;
    let timer = null;
    let lifecycle = 0;
    const chains = new Map();
    const noted = new Set();
    const feeds = new Map();

    function note(key, message) {
        if (noted.has(key)) return;
        noted.add(key);
        log(message);
    }
    function clearNotes(prefix) {
        for (const key of [...noted]) if (key.startsWith(prefix)) noted.delete(key);
    }

    function serial(guildId, task) {
        const previous = chains.get(guildId) || Promise.resolve();
        const next = previous.catch(() => {}).then(task);
        const tail = next.catch(() => {});
        chains.set(guildId, tail);
        tail.finally(() => { if (chains.get(guildId) === tail) chains.delete(guildId); }).catch(() => {});
        return next;
    }

    function sourceById(id) {
        return sources.find((source) => source.id === id) || null;
    }

    // The latest copy of one site's feed, or null if it can't be read right now.
    // Concurrent callers share one request.
    async function readSource(source, maxAgeMs = feedMaxAgeMs) {
        const cached = feeds.get(source.id) || {};
        if (cached.promise) return cached.promise;
        if (cached.feed && now() - cached.at < maxAgeMs) return cached.feed;
        const promise = (async () => {
            try {
                const response = await fetch(source.feed, cached.feed ? { etag: cached.etag || '', lastModified: cached.lastModified || '' } : {});
                if (response.notModified && cached.feed) {
                    feeds.set(source.id, { ...cached, at: now(), promise: null });
                    clearNotes(`source:${source.id}`);
                    return cached.feed;
                }
                const feed = cleanFeed(parseFeed(response.body));
                feeds.set(source.id, { feed, at: now(), etag: response.etag || '', lastModified: response.lastModified || '', promise: null });
                clearNotes(`source:${source.id}`);
                return feed;
            } catch (error) {
                feeds.set(source.id, { ...cached, promise: null });
                note(`source:${source.id}`, `Anime News could not read ${source.name}: ${redact(error && error.message ? error.message : error)}`);
                return null;
            }
        })();
        feeds.set(source.id, { ...cached, promise });
        return promise;
    }

    async function check(guildId) {
        const config = await readConfig(guildId);
        if (!config || !newsEnabled(config)) {
            // Forget what was seen, so switching back on starts fresh instead of catching up.
            const state = await store.get(guildId);
            if (state && Array.isArray(state.Sources) && state.Sources.length) await store.save(guildId, { Sources: [] });
            return { skipped: 'off' };
        }
        const channelId = newsChannel(config);
        if (!channelId) return { skipped: 'channel' };
        const followed = newsSources(config).map(sourceById).filter(Boolean);
        const state = await store.get(guildId);
        const previous = new Map((state && Array.isArray(state.Sources) ? state.Sources : []).map((entry) => [entry.Source, entry.Seen || []]));
        const checkedAt = new Date(now());
        const cutoff = now() - STALE_NEWS_MS;

        const nextSeen = new Map();
        const candidates = [];
        let seeded = 0;
        for (const source of followed) {
            const feed = await readSource(source);
            if (!feed) {
                // Unreadable right now: keep what was seen, try again next pass.
                if (previous.has(source.id)) nextSeen.set(source.id, previous.get(source.id));
                continue;
            }
            const ids = feed.items.map((item) => item.id);
            if (!previous.has(source.id)) {
                nextSeen.set(source.id, ids.slice(0, SEEN_LIMIT));
                seeded += 1;
                continue;
            }
            const seen = new Set(previous.get(source.id));
            const unseen = feed.items.filter((item) => !seen.has(item.id));
            // Every entry new at once means the site changed how it names stories.
            if (unseen.length > MAX_POSTS_PER_CHECK && unseen.length === feed.items.length) {
                nextSeen.set(source.id, ids.slice(0, SEEN_LIMIT));
                log(`Anime News re-read every entry of ${source.name} for server ${guildId} without posting.`);
                continue;
            }
            for (const item of unseen) {
                const fresh = !item.published || item.published.getTime() >= cutoff;
                if (fresh && source.isNews(item)) candidates.push({ source, feed, item });
            }
            nextSeen.set(source.id, { ids, old: previous.get(source.id) });
        }

        // Oldest first across every site, so the channel reads in order.
        candidates.sort((a, b) => (a.item.published?.getTime() || 0) - (b.item.published?.getTime() || 0));
        const toPost = candidates.slice(0, MAX_POSTS_PER_CHECK);
        const posted = new Set();
        let failed = false;
        if (toPost.length) {
            const channel = await resolveChannel(client, channelId);
            if (!channel || !canPost(channel, client)) {
                note(`${guildId}:channel`, `Anime News skipped server ${guildId} (channel): Mika needs View Channel, Send Messages, and Embed Links in the news channel.`);
                failed = true;
            } else {
                const template = newsMessage(config);
                const roleId = newsRole(config);
                for (const entry of toPost) {
                    try {
                        await channel.send(buildMessage(entry.source, entry.feed, entry.item, { template, roleId }));
                        posted.add(`${entry.source.id}:${entry.item.id}`);
                    } catch (error) {
                        note(`${guildId}:send`, `Anime News skipped server ${guildId} (send): ${redact(error && error.message ? error.message : error)}`);
                        failed = true;
                        break;
                    }
                }
            }
        }

        // News that was not posted yet stays unseen and goes out on a later pass.
        const waiting = new Set(candidates
            .map((entry) => `${entry.source.id}:${entry.item.id}`)
            .filter((key) => !posted.has(key)));
        const saved = [];
        for (const [sourceId, value] of nextSeen) {
            const list = Array.isArray(value)
                ? value
                : [...new Set([...value.ids.filter((id) => !waiting.has(`${sourceId}:${id}`)), ...value.old])].slice(0, SEEN_LIMIT);
            saved.push({ Source: sourceId, Seen: list });
        }
        // Sites the server stopped following are dropped, so following one again starts fresh.
        await store.save(guildId, {
            Sources: saved,
            CheckedAt: checkedAt,
            ...(posted.size ? { PostedAt: checkedAt } : {}),
        });
        if (!failed) clearNotes(`${guildId}:`);
        return { posted: posted.size, waiting: waiting.size, seeded };
    }

    async function runAll(cycle) {
        let ids;
        try {
            ids = await loadEnabled();
        } catch (error) {
            log('Anime News could not load servers.', redact(error));
            return;
        }
        for (const guildId of ids) {
            if (!started || cycle !== lifecycle) return;
            const guilds = client?.guilds?.cache;
            if (guilds && typeof guilds.has === 'function' && !guilds.has(guildId)) continue;
            await serial(guildId, () => check(guildId)).catch((error) => log('Anime News check failed.', redact(error)));
        }
    }

    function schedule(cycle, delay) {
        timer = setTimer(async () => {
            timer = null;
            if (!started || cycle !== lifecycle) return;
            await runAll(cycle);
            if (started && cycle === lifecycle) schedule(cycle, intervalMs);
        }, delay);
        timer?.unref?.();
    }

    function start(nextClient) {
        if (started) return;
        // One process does the checking. Other shards would post every story again.
        const shardIds = nextClient?.shard?.ids;
        if (Array.isArray(shardIds) && shardIds.length && shardIds[0] !== 0) return;
        client = nextClient;
        started = true;
        lifecycle += 1;
        schedule(lifecycle, firstCheckMs);
    }

    function stopAll() {
        started = false;
        lifecycle += 1;
        if (timer) clearTimer(timer);
        timer = null;
    }

    // After a /config change: record new sites (or post anything new) right away.
    function syncGuild(guildId) {
        const id = snowflake(guildId);
        if (!started || !id) return Promise.resolve(null);
        return serial(id, () => check(id)).catch((error) => {
            log('Anime News check failed.', redact(error));
            return null;
        });
    }

    // The newest news story from the followed sites, as it would be sent, without pinging anyone.
    async function preview(config) {
        const followed = newsSources(config).map(sourceById).filter(Boolean);
        if (!followed.length) return { error: 'Pick at least one news site to follow first.' };
        const read = await Promise.all(followed.map(async (source) => ({ source, feed: await readSource(source, intervalMs) })));
        let newest = null;
        for (const { source, feed } of read) {
            if (!feed) continue;
            const item = feed.items.find((entry) => source.isNews(entry));
            if (item && (!newest || (item.published?.getTime() || 0) > (newest.item.published?.getTime() || 0))) newest = { source, feed, item };
        }
        if (!newest) {
            const failed = read.filter((entry) => !entry.feed).map((entry) => entry.source.name);
            return { error: failed.length === read.length
                ? `I couldn't reach ${failed.join(', ')} right now. Try again in a few minutes.`
                : 'None of the followed sites has news in its feed right now.' };
        }
        const payload = buildMessage(newest.source, newest.feed, newest.item, { template: newsMessage(config), roleId: newsRole(config) });
        payload.allowedMentions = { parse: [], users: [], roles: [], repliedUser: false };
        return { payload };
    }

    return {
        start,
        stopAll,
        check: (guildId) => serial(guildId, () => check(guildId)),
        syncGuild,
        preview,
        runAll: () => runAll(lifecycle),
        get started() { return started; },
    };
}

const watcher = createNewsWatcher();

module.exports = {
    CHECK_INTERVAL_MS,
    MAX_POSTS_PER_CHECK,
    SEEN_LIMIT,
    STALE_NEWS_MS,
    createNewsWatcher,
    loadEnabledGuilds,
    startNewsWatcher: (client) => watcher.start(client),
    stopNewsWatcher: () => watcher.stopAll(),
    syncNewsGuild: (guildId) => watcher.syncGuild(guildId),
    previewNews: (config) => watcher.preview(config),
};
