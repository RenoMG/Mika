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

async function dropRound(client, guildId, config) {
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
        send: (payload) => channel.send(payload),
        attach: (round) => watchChannel(channel, round),
        choose: (id) => chooseRound(id),
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

function createScheduler({
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    loadEnabled = loadEnabledGuilds,
    readConfig = getGuildConfig,
    drop = dropRound,
    minutesOf = intervalMinutes,
    enabled = guessEnabled,
    channelOf = guessChannel,
} = {}) {
    const state = new Map();
    let started = false;
    let client = null;
    let generationClock = 0;
    let retryTimer = null;

    function stop(guildId) {
        const current = state.get(guildId);
        if (current && current.timer) clearTimer(current.timer);
        state.delete(guildId);
    }

    function arm(guildId, delayMs) {
        const current = state.get(guildId);
        if (current && current.timer) clearTimer(current.timer);
        generationClock += 1;
        const generation = generationClock;
        const timer = setTimer(() => {
            tick(guildId, generation);
        }, delayMs);
        if (timer && typeof timer.unref === 'function') timer.unref();
        state.set(guildId, { timer, generation });
        return generation;
    }

    async function tick(guildId, generation) {
        const current = state.get(guildId);
        if (!current || current.generation !== generation) return;
        state.set(guildId, { timer: null, generation });
        let minutes = GUESS_INTERVAL_DEFAULT;
        try {
            const config = await readConfig(guildId);
            if (!config || !enabled(config) || !channelOf(config)) {
                stop(guildId);
                return;
            }
            minutes = minutesOf(config);
            await drop(client, guildId, config);
        } catch (error) {
            console.error('Guess auto-drop failed.', redact(error));
        }
        const after = state.get(guildId);
        if (!after || after.generation !== generation) return;
        arm(guildId, minutes * 60 * 1000);
    }

    async function syncGuild(guildId) {
        const id = snowflake(guildId);
        if (!started || !id) return;
        const config = await readConfig(id);
        if (!config || !enabled(config) || !channelOf(config)) {
            stop(id);
            return;
        }
        arm(id, minutesOf(config) * 60 * 1000);
    }

    async function start(nextClient) {
        if (started) return;
        if (retryTimer) clearTimer(retryTimer);
        retryTimer = null;
        const ids = nextClient && nextClient.shard && Array.isArray(nextClient.shard.ids)
            ? nextClient.shard.ids
            : null;
        if (ids && ids.length && ids[0] !== 0) return;
        started = true;
        client = nextClient;
        try {
            const guilds = await loadEnabled();
            for (const guildId of guilds) {
                await syncGuild(guildId);
            }
        } catch (error) {
            console.error('Guess scheduler failed to start.', redact(error));
            started = false;
            retryTimer = setTimer(() => start(nextClient), 60000);
            retryTimer?.unref?.();
        }
    }

    function stopAll() {
        if (retryTimer) clearTimer(retryTimer);
        retryTimer = null;
        for (const guildId of state.keys()) stop(guildId);
        started = false;
    }
    return {
        stopAll,
        start,
        syncGuild,
        stop,
        arm,
        tick,
        get started() {
            return started;
        },
        size() {
            return state.size;
        },
    };
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
    startGuessScheduler,
    syncGuild,
    stopAll: () => scheduler.stopAll(),
};
