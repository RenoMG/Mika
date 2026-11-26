// Blog Watcher: checks each server's feed every 15 minutes and posts entries it
// has not seen. The first check of a feed only records what is already there,
// so turning the watcher on (or pointing it at another blog) never floods the
// channel with old posts. Conditional requests (ETag / Last-Modified) make an
// unchanged feed cost one small request.
const { PermissionFlagsBits } = require('discord.js');
const { fetchFeed, parseFeed } = require('./feed');
const { postMessage } = require('./post');
const { blogChannel, blogEnabled, blogFeed, blogMessage, blogRole } = require('./settings');
const { redact } = require('../utils/redact');
const { snowflake } = require('../utils/safeId');

const CHECK_INTERVAL_MS = 15 * 60000;
const FIRST_CHECK_MS = 30000;
const MAX_POSTS_PER_CHECK = 3;
const SEEN_LIMIT = 100;
// A post that first appears in the feed weeks after it was published is an
// old post that resurfaced, not news.
const STALE_POST_MS = 14 * 24 * 60 * 60000;

const mongoStore = {
    async get(guildId) {
        return require('../Models/BlogWatch').findOne({ GuildID: guildId }).lean();
    },
    async save(guildId, fields) {
        await require('../Models/BlogWatch').updateOne({ GuildID: guildId }, { $set: fields }, { upsert: true });
    },
};

async function loadEnabledGuilds() {
    const ConfigurationDB = require('../Models/ConfigurationDB');
    const docs = await ConfigurationDB.find({ 'BlogStatus.Status': 'true' }).select('GuildID').lean();
    return docs.map((doc) => snowflake(doc && doc.GuildID)).filter(Boolean);
}

async function readGuildConfig(guildId) {
    return require('../utils/getGuildConfig').getGuildConfig(guildId, { readOnly: true });
}

function canPost(channel, client) {
    if (!channel || typeof channel.send !== 'function' || typeof channel.permissionsFor !== 'function') return false;
    const me = client && client.user;
    if (!me) return false;
    let perms = null;
    try {
        perms = channel.permissionsFor(me);
    } catch (error) {
        return false;
    }
    return Boolean(perms && typeof perms.has === 'function'
        && perms.has(PermissionFlagsBits.ViewChannel)
        && perms.has(PermissionFlagsBits.SendMessages)
        && perms.has(PermissionFlagsBits.EmbedLinks));
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

function createWatcher({
    fetch = fetchFeed,
    store = mongoStore,
    readConfig = readGuildConfig,
    loadEnabled = loadEnabledGuilds,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    intervalMs = CHECK_INTERVAL_MS,
    firstCheckMs = FIRST_CHECK_MS,
    log = (...args) => console.error(...args),
} = {}) {
    let client = null;
    let started = false;
    let timer = null;
    let lifecycle = 0;
    const chains = new Map();
    const noted = new Set();

    // One problem is logged once per server until a check succeeds again.
    function noteSkip(guildId, reason, detail = '') {
        const key = `${guildId}:${reason}`;
        if (noted.has(key)) return;
        noted.add(key);
        log(`Blog Watcher skipped server ${guildId} (${reason})${detail ? `: ${detail}` : ''}`);
    }
    function noteOk(guildId) {
        for (const key of [...noted]) if (key.startsWith(`${guildId}:`)) noted.delete(key);
    }

    // Checks of one server never overlap, so two checks cannot post the same entry.
    function serial(guildId, task) {
        const previous = chains.get(guildId) || Promise.resolve();
        const next = previous.catch(() => {}).then(task);
        const tail = next.catch(() => {});
        chains.set(guildId, tail);
        tail.finally(() => { if (chains.get(guildId) === tail) chains.delete(guildId); }).catch(() => {});
        return next;
    }

    async function check(guildId) {
        const config = await readConfig(guildId);
        if (!config || !blogEnabled(config)) return { skipped: 'off' };
        const channelId = blogChannel(config);
        if (!channelId) return { skipped: 'channel' };
        const url = blogFeed(config);
        const state = await store.get(guildId);
        const fresh = !state || state.FeedURL !== url;
        const checkedAt = new Date(now());

        let response;
        try {
            response = await fetch(url, fresh ? {} : { etag: state.ETag || '', lastModified: state.LastModified || '' });
        } catch (error) {
            noteSkip(guildId, 'feed', error && error.message);
            return { skipped: 'feed', error };
        }
        if (response.notModified) {
            await store.save(guildId, { CheckedAt: checkedAt });
            noteOk(guildId);
            return { notModified: true };
        }
        let feed;
        try {
            feed = parseFeed(response.body);
        } catch (error) {
            noteSkip(guildId, 'feed', error && error.message);
            return { skipped: 'feed', error };
        }
        const ids = feed.items.map((item) => item.id);
        const headers = { ETag: response.etag || '', LastModified: response.lastModified || '' };
        const seed = () => store.save(guildId, { FeedURL: url, Seen: ids.slice(0, SEEN_LIMIT), ...headers, CheckedAt: checkedAt });

        if (fresh) {
            await seed();
            noteOk(guildId);
            return { seeded: ids.length };
        }
        const seen = new Set(state.Seen || []);
        const unseen = feed.items.filter((item) => !seen.has(item.id));
        // Every entry new at once means the blog changed how it names posts.
        if (unseen.length > MAX_POSTS_PER_CHECK && unseen.length === feed.items.length) {
            await seed();
            log(`Blog Watcher re-read every entry of the feed for server ${guildId} without posting.`);
            return { reseeded: ids.length };
        }

        const cutoff = now() - STALE_POST_MS;
        // The feed is newest first. Post the newest few, oldest of those first.
        const toPost = unseen
            .filter((item) => !item.published || item.published.getTime() >= cutoff)
            .slice(0, MAX_POSTS_PER_CHECK)
            .reverse();
        const posted = [];
        let failed = false;
        if (toPost.length) {
            const channel = await resolveChannel(client, channelId);
            if (!channel || !canPost(channel, client)) {
                noteSkip(guildId, 'channel', 'Mika needs View Channel, Send Messages, and Embed Links in the post channel.');
                failed = true;
            } else {
                const template = blogMessage(config);
                const roleId = blogRole(config);
                for (const item of toPost) {
                    try {
                        await channel.send(postMessage(feed, item, { template, roleId }));
                        posted.push(item.id);
                    } catch (error) {
                        noteSkip(guildId, 'send', redact(error && error.message ? error.message : error));
                        failed = true;
                        break;
                    }
                }
            }
        }

        // Entries that could not be sent stay unseen and are tried on the next check.
        const waiting = new Set(toPost.map((item) => item.id).filter((id) => !posted.includes(id)));
        const nextSeen = [...new Set([...ids.filter((id) => !waiting.has(id)), ...(state.Seen || [])])].slice(0, SEEN_LIMIT);
        await store.save(guildId, {
            Seen: nextSeen,
            // Keep the old validators after a failure, so the next check reads the whole feed again.
            ...(failed ? {} : headers),
            CheckedAt: checkedAt,
            ...(posted.length ? { PostedAt: checkedAt } : {}),
        });
        if (!failed) noteOk(guildId);
        return { posted: posted.length, waiting: waiting.size };
    }

    async function runAll(cycle) {
        let ids;
        try {
            ids = await loadEnabled();
        } catch (error) {
            log('Blog Watcher could not load servers.', redact(error));
            return;
        }
        for (const guildId of ids) {
            if (!started || cycle !== lifecycle) return;
            const guilds = client?.guilds?.cache;
            if (guilds && typeof guilds.has === 'function' && !guilds.has(guildId)) continue;
            await serial(guildId, () => check(guildId)).catch((error) => log('Blog Watcher check failed.', redact(error)));
        }
    }

    function schedule(cycle, delay) {
        timer = setTimer(async () => {
            timer = null;
            if (!started || cycle !== lifecycle) return;
            await runAll(cycle);
            // Timed from the end of a pass, so a slow blog never stacks checks.
            if (started && cycle === lifecycle) schedule(cycle, intervalMs);
        }, delay);
        timer?.unref?.();
    }

    function start(nextClient) {
        if (started) return;
        // One process does the checking. Other shards would post every entry again.
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

    // After a /config change: record the feed (or post anything new) right away.
    function syncGuild(guildId) {
        const id = snowflake(guildId);
        if (!started || !id) return Promise.resolve(null);
        return serial(id, () => check(id)).catch((error) => {
            log('Blog Watcher check failed.', redact(error));
            return null;
        });
    }

    // The newest post as it would be sent, without pinging anyone.
    async function preview(config) {
        let feed;
        try {
            const response = await fetch(blogFeed(config));
            feed = parseFeed(response.body);
        } catch (error) {
            return { error: `I couldn't read the feed: ${error && error.message ? error.message : 'unknown error'}` };
        }
        const item = feed.items[0];
        if (!item) return { error: 'That feed has no posts yet.' };
        const payload = postMessage(feed, item, { template: blogMessage(config), roleId: blogRole(config) });
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

const watcher = createWatcher();

module.exports = {
    CHECK_INTERVAL_MS,
    MAX_POSTS_PER_CHECK,
    SEEN_LIMIT,
    STALE_POST_MS,
    canPost,
    createWatcher,
    loadEnabledGuilds,
    startBlogWatcher: (client) => watcher.start(client),
    stopBlogWatcher: () => watcher.stopAll(),
    syncBlogGuild: (guildId) => watcher.syncGuild(guildId),
    previewBlogPost: (config) => watcher.preview(config),
};
