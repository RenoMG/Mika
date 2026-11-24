const { createHash } = require('node:crypto');
const { createWorkQueue } = require('./queue');
const { PermissionFlagsBits } = require('discord.js');
const ConfigurationDB = require('../Models/ConfigurationDB');
const { getGuildConfig } = require('../utils/getGuildConfig');
const { redact } = require('../utils/redact');
const { snowflake } = require('../utils/safeId');
const { GUESS_INTERVAL_DEFAULT } = require('./constants');
const { locks } = require('./lock');
const { clientHasMessageContent, roundLockKey, startRound, watchChannel } = require('./round');
const { chooseRound } = require('./select');
const { guessChannel, guessEnabled, intervalMinutes } = require('./settings');

const noted = new Set();

function noteSkip(guildId, reason) {
    const key = `${guildId}:${reason}`;
    if (noted.has(key)) return;
    noted.add(key);
    console.error(`Guess auto-drop skipped (${reason}) for server ${guildId}.`);
}

function noteOk(guildId) {
    for (const key of [...noted]) {
        if (key.startsWith(`${guildId}:`)) noted.delete(key);
    }
}

function canPost(channel, client) {
    if (!channel || channel.guild == null || typeof channel.send !== 'function') return false;
    const me = client && client.user;
    if (!me || typeof channel.permissionsFor !== 'function') return false;
    let perms = null;
    try {
        perms = channel.permissionsFor(me);
    } catch (error) {
        return false;
    }
    if (!perms || typeof perms.has !== 'function') return false;
    return perms.has(PermissionFlagsBits.ViewChannel)
        && perms.has(PermissionFlagsBits.SendMessages)
        && perms.has(PermissionFlagsBits.EmbedLinks);
}

async function resolveChannel(client, channelId) {
    const cache = client && client.channels && client.channels.cache;
    const cached = cache && typeof cache.get === 'function' ? cache.get(channelId) : null;
    if (cached) return cached;
    if (!client || !client.channels || typeof client.channels.fetch !== 'function') return null;
    return client.channels.fetch(channelId);
}

async function dropRound(client, guildId, config, { isCurrent = () => true, choose = (id) => chooseRound(id, { cacheOnly: true }) } = {}) {
    const guildKey = snowflake(guildId);
    const channelId = guessChannel(config);
    if (!guildKey || !channelId) return { skipped: 'channel' };
    if (!clientHasMessageContent(client)) {
        noteSkip(guildKey, 'intent');
        return { skipped: 'intent' };
    }
    let channel = null;
    try {
        channel = await resolveChannel(client, channelId);
    } catch (error) {
        noteSkip(guildKey, 'channel');
        return { skipped: 'channel' };
    }
    if (!channel) {
        noteSkip(guildKey, 'channel');
        return { skipped: 'channel' };
    }
    if (!canPost(channel, client)) {
        noteSkip(guildKey, 'permissions');
        return { skipped: 'permissions' };
    }
    if (locks.held(roundLockKey({ manual: false, channelId }))) return { skipped: 'busy' };
    const result = await startRound({
        channelId,
        guildId: guildKey,
        manual: false,
        hasContentIntent: true,
        send: (payload) => {
            if (!isCurrent()) throw new Error('Guess schedule changed before posting.');
            return channel.send(payload);
        },
        attach: (round) => watchChannel(channel, round),
        choose,
    });
    if (result && result.ok) noteOk(guildKey);
    else if (result && result.down) noteSkip(guildKey, 'shikimori');
    return result;
}

async function loadEnabledGuilds() {
    const docs = await ConfigurationDB.find({ 'GuessStatus.Status': 'true' }).select('GuildID').lean();
    const ids = [];
    for (const doc of docs) {
        const id = snowflake(doc && doc.GuildID);
        if (id) ids.push(id);
    }
    return ids;
}

// Stable server phases spread a restart over a full ten-minute window.
function initialSpread(guildId) {
    return createHash('sha256').update(String(guildId)).digest().readUInt32BE(0) % 600000;
}

function createScheduler({
    setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now, random = Math.random,
    loadEnabled = loadEnabledGuilds, readConfig = getGuildConfig, drop = dropRound,
    minutesOf = intervalMinutes, enabled = guessEnabled, channelOf = guessChannel,
    spread = initialSpread, queueOptions = {},
} = {}) {
    const state = new Map();
    let started = false;
    let client = null;
    let generationClock = 0;
    let lifecycle = 0;
    let retryTimer = null;
    const queue = createWorkQueue({ ...queueOptions, now, setTimer, clearTimer,
        onError: (error) => console.error('Guess queue failed.', redact(error)) });
    const jitter = () => Math.floor(Math.max(0, Math.min(1, random())) * 30000);
    const minutes = (config) => Math.max(10, Math.min(1440, Number(minutesOf(config)) || GUESS_INTERVAL_DEFAULT));

    function stop(guildId) {
        const current = state.get(guildId);
        if (current?.timer) clearTimer(current.timer);
        queue.cancel(guildId);
        state.delete(guildId);
    }
    function arm(guildId, delayMs) {
        const current = state.get(guildId);
        if (current?.timer) clearTimer(current.timer);
        queue.cancel(guildId);
        const generation = ++generationClock;
        const timer = setTimer(() => tick(guildId, generation), delayMs);
        timer?.unref?.();
        state.set(guildId, { timer, generation });
        return generation;
    }
    function tick(guildId, generation) {
        const current = state.get(guildId);
        if (!started || !current || current.generation !== generation || current.queued) return;
        if (current.timer) clearTimer(current.timer);
        state.set(guildId, { timer: null, generation, queued: true });
        const isCurrent = () => started && state.get(guildId)?.generation === generation;
        const accepted = queue.add(guildId, async () => {
            if (!isCurrent()) return;
            let interval = GUESS_INTERVAL_DEFAULT;
            try {
                const config = await readConfig(guildId);
                if (!isCurrent()) return;
                if (!config || !enabled(config) || !channelOf(config)) { stop(guildId); return; }
                interval = minutes(config);
                await drop(client, guildId, config, { isCurrent });
            } catch (error) {
                console.error('Guess auto-drop failed.', redact(error));
            } finally {
                // Schedule from completion, never catch up with a burst of missed drops.
                if (isCurrent()) arm(guildId, interval * 60000 + jitter());
            }
        });
        // Saturation postpones the server without growing the waiting queue.
        if (!accepted && isCurrent()) arm(guildId, 30000 + jitter());
    }
    async function syncGuild(guildId) {
        const id = snowflake(guildId);
        if (!started || !id) return;
        stop(id);
        const generation = ++generationClock;
        state.set(id, { timer: null, generation });
        let config;
        try { config = await readConfig(id); }
        catch (error) {
            if (started && state.get(id)?.generation === generation) {
                const timer = setTimer(() => {
                    if (started && state.get(id)?.generation === generation) {
                        return syncGuild(id).catch((failure) => console.error('Guess schedule sync failed.', redact(failure)));
                    }
                }, 60000);
                timer?.unref?.();
                state.set(id, { timer, generation });
            }
            throw error;
        }
        if (!started || state.get(id)?.generation !== generation) return;
        if (!config || !enabled(config) || !channelOf(config)) { stop(id); return; }
        arm(id, minutes(config) * 60000 + spread(id));
    }
    async function start(nextClient) {
        if (started) return;
        if (retryTimer) clearTimer(retryTimer);
        retryTimer = null;
        const ids = nextClient?.shard?.ids;
        if (Array.isArray(ids) && ids.length && ids[0] !== 0) return;
        started = true;
        const cycle = ++lifecycle;
        client = nextClient;
        try {
            const guilds = await loadEnabled();
            for (const guildId of guilds) {
                if (!started || cycle !== lifecycle) return;
                await syncGuild(guildId);
            }
        } catch (error) {
            if (cycle !== lifecycle) return;
            console.error('Guess scheduler failed to start.', redact(error));
            stopAll();
            retryTimer = setTimer(() => start(nextClient), 60000);
            retryTimer?.unref?.();
        }
    }
    function stopAll() {
        started = false;
        lifecycle += 1;
        if (retryTimer) clearTimer(retryTimer);
        retryTimer = null;
        for (const guildId of state.keys()) stop(guildId);
        queue.clear();
    }
    return { start, stopAll, syncGuild, stop, arm, tick,
        get started() { return started; }, size: () => state.size, queueStats: queue.stats };
}

const scheduler = createScheduler();

function startGuessScheduler(client) {
    return scheduler.start(client);
}

function syncGuild(guildId) {
    return scheduler.syncGuild(guildId);
}

module.exports = {
    canPost,
    dropRound,
    loadEnabledGuilds,
    createScheduler,
    initialSpread,
    startGuessScheduler,
    syncGuild,
    stopAll: () => scheduler.stopAll(),
    queueStats: () => scheduler.queueStats(),
};
