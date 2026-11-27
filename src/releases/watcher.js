// Anime Releases: every 10 minutes, reads what aired (AniList's airing
// schedule, and LiveChart.me's episode feed for servers that follow it) and
// posts the releases each server follows to its release channel.
//
// - Each source is read once per pass and shared by every server. All the
//   AniList entries (premieres, popular shows, finales, everything) are views
//   of one request.
// - The first time a server follows an entry, what already aired is only
//   recorded, so switching Anime Releases on never floods.
// - An episode that matches two followed entries is posted once. Episodes of
//   one show that come out together (a whole season dropped at once) are one post.
// - At most 5 posts go out per pass, oldest first. The rest wait for the next
//   pass, as long as they are still fresh.
const { fetchFeed, parseFeed } = require('../blog/feed');
const { canPost } = require('../blog/watcher');
const { fetchAiring } = require('./anilist');
const { releaseMessage: buildMessage } = require('./post');
const { SOURCES, loadKey } = require('./sources');
const { releaseChannel, releaseMessage, releaseRole, releaseSources, releasesEnabled } = require('./settings');
const { redact } = require('../utils/redact');
const { snowflake } = require('../utils/safeId');

const CHECK_INTERVAL_MS = 10 * 60000;
const FIRST_CHECK_MS = 50000;
const MAX_POSTS_PER_CHECK = 5;
const SEEN_LIMIT = 300;
// How far back the airing schedule is read, and how late a release can still be posted.
const AIRING_WINDOW_MS = 3 * 60 * 60000;
const STALE_RELEASE_MS = AIRING_WINDOW_MS;
const FEED_MAX_AGE_MS = 2 * 60000;

const mongoStore = {
    async get(guildId) {
        return require('../Models/ReleaseWatch').findOne({ GuildID: guildId }).lean();
    },
    async save(guildId, fields) {
        await require('../Models/ReleaseWatch').updateOne({ GuildID: guildId }, { $set: fields }, { upsert: true });
    },
};

async function loadEnabledGuilds() {
    const ConfigurationDB = require('../Models/ConfigurationDB');
    const docs = await ConfigurationDB.find({ 'ReleaseStatus.Status': 'true' }).select('GuildID').lean();
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

// Episodes of one show posted together become one item spanning them.
function groupByShow(candidates) {
    const groups = new Map();
    for (const entry of candidates) {
        const key = entry.item.mediaId ? `show:${entry.item.mediaId}` : `${entry.key}`;
        const group = groups.get(key);
        if (!group) {
            groups.set(key, { ...entry, keys: [entry.key] });
            continue;
        }
        group.keys.push(entry.key);
        const low = group.item.episode <= entry.item.episode ? group.item : entry.item;
        const high = Math.max(group.item.episodeTo || group.item.episode, entry.item.episodeTo || entry.item.episode);
        const latest = (entry.item.published?.getTime() || 0) > (group.item.published?.getTime() || 0) ? entry.item : group.item;
        group.item = { ...latest, episode: low.episode, episodeTo: high };
    }
    return [...groups.values()];
}

function createReleaseWatcher({
    fetch = fetchFeed,
    fetchSchedule = fetchAiring,
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

    async function load(source, cached) {
        if (source.load === 'anilist') {
            const to = Math.floor(now() / 1000);
            return { feed: await fetchSchedule({ from: to - Math.floor(AIRING_WINDOW_MS / 1000), to }) };
        }
        const response = await fetch(source.feed, cached.feed ? { etag: cached.etag || '', lastModified: cached.lastModified || '' } : {});
        if (response.notModified && cached.feed) return { feed: cached.feed, etag: cached.etag, lastModified: cached.lastModified };
        return { feed: parseFeed(response.body), etag: response.etag || '', lastModified: response.lastModified || '' };
    }

    // The latest copy of one source's data, or null if it can't be read right
    // now. Entries with the same load key, and concurrent callers, share one request.
    async function readSource(source, maxAgeMs = feedMaxAgeMs) {
        const key = loadKey(source);
        const cached = feeds.get(key) || {};
        if (cached.promise) return cached.promise;
        if (cached.feed && now() - cached.at < maxAgeMs) return cached.feed;
        const promise = (async () => {
            try {
                const result = await load(source, cached);
                feeds.set(key, { ...result, at: now(), promise: null });
                clearNotes(`source:${key}`);
                return result.feed;
            } catch (error) {
                feeds.set(key, { ...cached, promise: null });
                note(`source:${key}`, `Anime Releases could not read ${source.load === 'anilist' ? 'AniList' : source.name}: ${redact(error && error.message ? error.message : error)}`);
                return null;
            }
        })();
        feeds.set(key, { ...cached, promise });
        return promise;
    }

    async function check(guildId) {
        const config = await readConfig(guildId);
        if (!config || !releasesEnabled(config)) {
            // Forget what was seen, so switching back on starts fresh instead of catching up.
            const state = await store.get(guildId);
            if (state && Array.isArray(state.Sources) && state.Sources.length) await store.save(guildId, { Sources: [] });
            return { skipped: 'off' };
        }
        const channelId = releaseChannel(config);
        if (!channelId) return { skipped: 'channel' };
        const followed = releaseSources(config).map(sourceById).filter(Boolean);
        const state = await store.get(guildId);
        const previous = new Map((state && Array.isArray(state.Sources) ? state.Sources : []).map((entry) => [entry.Source, entry.Seen || []]));
        const checkedAt = new Date(now());
        const cutoff = now() - STALE_RELEASE_MS;

        const nextSeen = new Map();
        const candidates = new Map();
        let seeded = 0;
        for (const source of followed) {
            const feed = await readSource(source);
            if (!feed) {
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
            // Every entry new at once (and more than a pass's worth) means the
            // source changed how it names items, or Mika was away for hours.
            if (unseen.length > MAX_POSTS_PER_CHECK && unseen.length === feed.items.length) {
                nextSeen.set(source.id, ids.slice(0, SEEN_LIMIT));
                log(`Anime Releases re-read every entry of ${source.name} for server ${guildId} without posting.`);
                continue;
            }
            for (const item of unseen) {
                const fresh = !item.published || item.published.getTime() >= cutoff;
                const key = `${loadKey(source)}:${item.id}`;
                // The first followed entry it matches is the one it is posted under.
                if (fresh && source.matches(item) && !candidates.has(key)) candidates.set(key, { key, source, feed, item });
            }
            nextSeen.set(source.id, { ids, old: previous.get(source.id) });
        }

        const posts = groupByShow([...candidates.values()])
            .sort((a, b) => (a.item.published?.getTime() || 0) - (b.item.published?.getTime() || 0));
        const toPost = posts.slice(0, MAX_POSTS_PER_CHECK);
        const posted = new Set();
        let failed = false;
        if (toPost.length) {
            const channel = await resolveChannel(client, channelId);
            if (!channel || !canPost(channel, client)) {
                note(`${guildId}:channel`, `Anime Releases skipped server ${guildId} (channel): Mika needs View Channel, Send Messages, and Embed Links in the release channel.`);
                failed = true;
            } else {
                const template = releaseMessage(config);
                const roleId = releaseRole(config);
                for (const entry of toPost) {
                    try {
                        await channel.send(buildMessage(entry.source, entry.feed, entry.item, { template, roleId }));
                        for (const key of entry.keys) posted.add(key);
                    } catch (error) {
                        note(`${guildId}:send`, `Anime Releases skipped server ${guildId} (send): ${redact(error && error.message ? error.message : error)}`);
                        failed = true;
                        break;
                    }
                }
            }
        }

        // Releases not posted yet stay unseen and go out on a later pass.
        const waiting = new Set([...candidates.keys()].filter((key) => !posted.has(key)));
        const saved = [];
        for (const [sourceId, value] of nextSeen) {
            const prefix = `${loadKey(sourceById(sourceId))}:`;
            const list = Array.isArray(value)
                ? value
                : [...new Set([...value.ids.filter((id) => !waiting.has(`${prefix}${id}`)), ...value.old])].slice(0, SEEN_LIMIT);
            saved.push({ Source: sourceId, Seen: list });
        }
        await store.save(guildId, {
            Sources: saved,
            CheckedAt: checkedAt,
            ...(posted.size ? { PostedAt: checkedAt } : {}),
        });
        if (!failed) clearNotes(`${guildId}:`);
        return { posted: toPost.filter((entry) => entry.keys.every((key) => posted.has(key))).length, waiting: waiting.size, seeded };
    }

    async function runAll(cycle) {
        let ids;
        try {
            ids = await loadEnabled();
        } catch (error) {
            log('Anime Releases could not load servers.', redact(error));
            return;
        }
        for (const guildId of ids) {
            if (!started || cycle !== lifecycle) return;
            const guilds = client?.guilds?.cache;
            if (guilds && typeof guilds.has === 'function' && !guilds.has(guildId)) continue;
            await serial(guildId, () => check(guildId)).catch((error) => log('Anime Releases check failed.', redact(error)));
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
        // One process does the checking. Other shards would post every release again.
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

    function syncGuild(guildId) {
        const id = snowflake(guildId);
        if (!started || !id) return Promise.resolve(null);
        return serial(id, () => check(id)).catch((error) => {
            log('Anime Releases check failed.', redact(error));
            return null;
        });
    }

    // The latest release the server follows, as it would be sent, without pinging anyone.
    async function preview(config) {
        const followed = releaseSources(config).map(sourceById).filter(Boolean);
        if (!followed.length) return { error: 'Pick at least one release type to follow first.' };
        const read = [];
        for (const source of followed) read.push({ source, feed: await readSource(source, intervalMs) });
        let newest = null;
        for (const { source, feed } of read) {
            if (!feed) continue;
            const item = feed.items.find((entry) => source.matches(entry));
            if (item && (!newest || (item.published?.getTime() || 0) > (newest.item.published?.getTime() || 0))) newest = { source, feed, item };
        }
        if (!newest) {
            const failed = read.filter((entry) => !entry.feed);
            return { error: failed.length === read.length
                ? 'I couldn\'t reach the release sources right now. Try again in a few minutes.'
                : 'Nothing you follow has aired in the last 3 hours. Try again later, or follow more release types.' };
        }
        const payload = buildMessage(newest.source, newest.feed, newest.item, { template: releaseMessage(config), roleId: releaseRole(config) });
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

const watcher = createReleaseWatcher();

module.exports = {
    AIRING_WINDOW_MS,
    CHECK_INTERVAL_MS,
    MAX_POSTS_PER_CHECK,
    SEEN_LIMIT,
    STALE_RELEASE_MS,
    createReleaseWatcher,
    groupByShow,
    loadEnabledGuilds,
    startReleaseWatcher: (client) => watcher.start(client),
    stopReleaseWatcher: () => watcher.stopAll(),
    syncReleaseGuild: (guildId) => watcher.syncGuild(guildId),
    previewReleases: (config) => watcher.preview(config),
};
