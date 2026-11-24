const { withTimeout, createCache } = require('../anime/cache');
let inventory = null;
let inventoryUntil = 0;
let countValue = null;
let countUntil = 0;
let countJob = null;
let inventoryJob = null;
const localAnime = createCache({ max: 400, ttlMs: 60000 });
function resetCache() {
    inventory = null; inventoryUntil = 0; countValue = null; countUntil = 0;
    localAnime.clear();
}
const getGuessAnime = require('../Models/GuessAnime').get;
const GuessGuild = require('../Models/GuessGuild');
const GuessPlayer = require('../Models/GuessPlayer');
const { noteWrite } = require('../db/evict');
const { snowflake } = require('../utils/safeId');
const { GUESS_CRYSTALS, GUESS_PLAY_LIMIT } = require('./constants');
const { animeKey, isStale, pickScreenshot, rememberUse } = require('./policy');
const { malKey } = require('./shikimori');
const { judgePlays } = require('./plays');

function playerKeys(userId, guildId) {
    const userID = snowflake(userId);
    const guildID = snowflake(guildId);
    if (!userID || !guildID) return null;
    return { userID, guildID };
}

function text(value, max) {
    return typeof value === 'string' ? value.slice(0, max) : '';
}

function words(value, max, itemMax) {
    if (!Array.isArray(value)) return [];
    const list = [];
    for (const item of value) {
        if (typeof item !== 'string' || !item.trim()) continue;
        list.push(item.slice(0, itemMax));
        if (list.length >= max) break;
    }
    return list;
}

function httpText(value) {
    if (typeof value !== 'string' || value.length > 300) return '';
    return /^https?:\/\//i.test(value) ? value : '';
}

function dateRecord(value) {
    if (!value || typeof value !== 'object' || !value.year) return null;
    return {
        year: Number(value.year) || null,
        month: Number(value.month) || null,
        day: Number(value.day) || null,
    };
}

function mediaRecord(media) {
    const id = animeKey(media && media.id);
    const idMal = malKey(media && media.idMal);
    if (!id || !idMal) return null;
    const titles = media.titles || {};
    return {
        id,
        idMal,
        source: media.source === 'Kitsu' ? 'Kitsu' : 'AniList',
        url: httpText(media.url),
        cover: httpText(media.cover),
        titles: {
            romaji: text(titles.romaji, 300),
            english: text(titles.english, 300),
            native: text(titles.native, 300),
        },
        synonyms: words(media.synonyms, 12, 300),
        format: text(media.format, 30),
        guessContextVersion: media.guessContextVersion === 1 ? 1 : 0,
        relatedTitles: words(media.relatedTitles, 24, 160),
        synopsis: text(media.synopsis, 1200),
        episodes: Number.isInteger(media.episodes) ? media.episodes : null,
        status: text(media.status, 40),
        score: Number.isInteger(media.score) ? media.score : null,
        genres: words(media.genres, 12, 40),
        tags: words(media.tags, 8, 40),
        studios: words(media.studios, 4, 80),
        startDate: dateRecord(media.startDate),
        endDate: dateRecord(media.endDate),
    };
}

function plainAnime(doc) {
    if (!doc) return null;
    return {
        anilistId: String(doc.anilistId),
        idMal: doc.idMal,
        titles: doc.titles || {},
        synonyms: Array.isArray(doc.synonyms) ? doc.synonyms.slice() : [],
        media: doc.media,
        screenshots: Array.isArray(doc.screenshots) ? doc.screenshots.slice() : [],
        fetchedAt: doc.fetchedAt,
    };
}

function guessAnime() {
    try {
        return getGuessAnime();
    } catch (error) {
        return null;
    }
}

async function countAnime() {
    const GuessAnime = guessAnime();
    if (!GuessAnime) return localAnime.keys().length;
    if (countValue !== null && countUntil > Date.now()) return countValue;
    if (countJob) return countJob;
    countJob = (async () => {
        try {
            const count = await withTimeout(GuessAnime.countDocuments().maxTimeMS(200), 250);
            if (inventory && inventory.length !== count) inventory = null;
            countValue = Math.max(count, localAnime.keys().length); countUntil = Date.now() + 60000;
            return countValue;
        } catch {
            countValue = localAnime.keys().length; countUntil = Date.now() + 5000;
            return countValue;
        }
    })().finally(() => { countJob = null; });
    return countJob;
}

async function listIds() {
    const GuessAnime = guessAnime();
    if (!GuessAnime) return localAnime.keys();
    if (inventory && inventoryUntil > Date.now()) return inventory.slice();
    if (inventoryJob) return inventoryJob;
    inventoryJob = (async () => {
        try {
            const rows = await withTimeout(GuessAnime.find({}, { anilistId: 1 }).sort({ anilistId: 1 }).limit(12000).maxTimeMS(200).lean(), 250);
            const ids = [];
            for (const row of rows) {
                const id = animeKey(row && row.anilistId);
                if (id) ids.push(id);
            }
            for (const id of localAnime.keys()) if (!ids.includes(id) && ids.length < 12000) ids.push(id);
            ids.sort((left, right) => Number(left) - Number(right));
            inventory = ids; inventoryUntil = Date.now() + 60000;
            return ids.slice();
        } catch (error) {
            inventory = localAnime.keys(); inventoryUntil = Date.now() + 5000;
            return inventory.slice();
        }
    })().finally(() => { inventoryJob = null; });
    return inventoryJob;
}

async function loadAnime(anilistId) {
    const id = animeKey(anilistId);
    if (!id) return null;
    const hit = localAnime.get(id);
    if (hit) return hit;
    const GuessAnime = guessAnime();
    if (!GuessAnime) return null;
    try {
        const doc = await withTimeout(GuessAnime.findOne({ anilistId: id }).maxTimeMS(200).lean(), 250);
        if (doc && doc._id && Date.now() - new Date(doc.lastAccessedAt || 0).getTime() >= 60000) {
            Promise.resolve(GuessAnime.updateOne(
                { _id: doc._id },
                { $set: { lastAccessedAt: new Date() } },
            )).catch(() => {});
        }
        const record = plainAnime(doc);
        if (record) localAnime.set(id, record);
        return record;
    } catch (error) {
        return null;
    }
}

async function saveAnime(media, urls, now = Date.now()) {
    const record = mediaRecord(media);
    if (!record) return null;
    const screenshots = [];
    const seen = new Set();
    for (const url of urls || []) {
        if (typeof url !== 'string' || !url.startsWith('https://shikimori.io/') || seen.has(url)) continue;
        seen.add(url);
        screenshots.push(url);
        if (screenshots.length >= 40) break;
    }
    if (!screenshots.length) return null;
    const fetchedAt = new Date(now);
    const written = {
        anilistId: record.id,
        idMal: record.idMal,
        titles: record.titles,
        synonyms: record.synonyms,
        media: record,
        screenshots,
        fetchedAt,
        lastAccessedAt: fetchedAt,
    };
    localAnime.set(record.id, plainAnime(written));
    countValue = null;
    inventory = null;
    const GuessAnime = guessAnime();
    if (GuessAnime) {
        try {
            await withTimeout(GuessAnime.findOneAndUpdate(
                { anilistId: record.id },
                { $set: written },
                { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
            ).maxTimeMS(200), 250);
            inventory = null;
            noteWrite('guessAnime');
        } catch (error) {
            // The round can still use this copy. A cache write must not fail it.
        }
    }
    try {
        // The same AniList record can satisfy /search and /guess without a second fetch.
        const { rememberDetail } = require('../anime/cache');
        void rememberDetail(record).catch(() => {});
    } catch (error) {
        // The guess copy is already saved. A detail-cache write must not fail the round.
    }
    return plainAnime(written);
}

async function loadGuild(guildId) {
    const guildID = snowflake(guildId);
    if (!guildID) return { recentIds: [], shown: [] };
    const doc = await GuessGuild.findOne({ guildID }).maxTimeMS(1000).lean();
    const recentIds = [];
    for (const id of (doc && doc.recentIds) || []) {
        const key = animeKey(id);
        if (key && !recentIds.includes(key)) recentIds.push(key);
    }
    const shown = [];
    for (const entry of (doc && doc.shown) || []) {
        const animeId = animeKey(entry && entry.animeId);
        if (!animeId) continue;
        const urls = [];
        for (const url of entry.urls || []) {
            if (typeof url !== 'string' || !url.startsWith('https://shikimori.io/')) continue;
            urls.push(url);
        }
        shown.push({ animeId, urls });
    }
    return { recentIds, shown };
}

async function saveGuild(guildId, state) {
    const guildID = snowflake(guildId);
    if (!guildID) return null;
    const recentIds = [];
    for (const id of (state && state.recentIds) || []) {
        const key = animeKey(id);
        if (!key || recentIds.includes(key)) continue;
        recentIds.push(key);
        if (recentIds.length >= 50) break;
    }
    const shown = [];
    for (const entry of (state && state.shown) || []) {
        const animeId = animeKey(entry && entry.animeId);
        if (!animeId) continue;
        const urls = [];
        for (const url of entry.urls || []) {
            if (typeof url !== 'string' || !url.startsWith('https://shikimori.io/')) continue;
            urls.push(url);
            if (urls.length >= 40) break;
        }
        shown.push({ animeId, urls });
        if (shown.length >= 60) break;
    }
    await GuessGuild.findOneAndUpdate(
        { guildID },
        { $set: { recentIds, shown } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    return { recentIds, shown };
}

// Serialize the small read/update per server so simultaneous personal rounds
// cannot overwrite each other's screenshot history. The bot runs one process.
const guildWork = new Map();
async function takeScreenshot(guildId, doc, random = Math.random) {
    const key = snowflake(guildId);
    if (!key || guildWork.size >= 4000 && !guildWork.has(key)) return null;
    const current = guildWork.get(key) || { tail: Promise.resolve(), count: 0 };
    if (current.count >= 8) return null;
    current.count += 1;
    guildWork.set(key, current);
    const job = current.tail.catch(() => {}).then(() => reserveScreenshot(guildId, doc, random));
    current.tail = job;
    try { return await job; }
    finally { current.count -= 1; if (!current.count) guildWork.delete(key); }
}
async function reserveScreenshot(guildId, doc, random = Math.random) {
    const guildID = snowflake(guildId);
    const anilistId = animeKey(doc && doc.anilistId);
    if (!guildID || !anilistId) return null;
    const guild = await loadGuild(guildID);
    const current = (guild.shown.find((entry) => entry.animeId === anilistId) || {}).urls || [];
    const shot = pickScreenshot(doc.screenshots, current, random);
    if (!shot) return null;
    const next = rememberUse(guild, anilistId, shot.shown);
    await saveGuild(guildID, next);
    return {
        media: doc.media,
        url: shot.url,
        anilistId,
    };
}

function stampsOf(doc) {
    const stamps = [];
    for (const value of (doc && doc.plays) || []) {
        const time = value instanceof Date ? value.getTime() : Date.parse(value);
        if (Number.isFinite(time)) stamps.push(time);
    }
    return stamps;
}

async function consumePlay(userId, guildId, now = Date.now()) {
    const keys = playerKeys(userId, guildId);
    if (!keys) throw new TypeError('A user id was not provided.');
    try { await GuessPlayer.updateOne(keys, { $setOnInsert: { plays: [], wins: 0, crystals: 0 } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
    for (let retry = 0; retry < 20; retry += 1) {
        const existing = await GuessPlayer.findOne(keys).lean();
        const existingStamps = stampsOf(existing);
        // A request started earlier may read a reservation made a millisecond later.
        // Never discard that newer reservation when retrying the compare-and-swap.
        const effectiveNow = Math.max(now, ...existingStamps);
        const judged = judgePlays(existingStamps, effectiveNow);
        if (!judged.allowed) return judged;
        // Ensure a refund identifies one reservation, including same-ms requests.
        let stamp = effectiveNow;
        while (judged.plays.includes(stamp)) stamp -= 1;
        const plays = [...judged.plays, stamp];
        const result = await GuessPlayer.updateOne({ ...keys, plays: existing.plays || [] },
            { $set: { plays: plays.map((time) => new Date(time)) } });
        if (result.modifiedCount) return { allowed: true, stamp, plays, remaining: Math.max(0, GUESS_PLAY_LIMIT - plays.length) };
    }
    throw new Error('Play quota changed repeatedly. Try again.');
}

async function refundPlay(userId, guildId, stamp) {
    const keys = playerKeys(userId, guildId);
    if (!keys || !Number.isFinite(stamp)) return;
    await GuessPlayer.updateOne(keys, { $pull: { plays: new Date(stamp) } });
}

async function awardWin(userId, guildId) {
    const keys = playerKeys(userId, guildId);
    if (!keys) throw new TypeError('A user id was not provided.');
    const update = { $inc: { wins: 1, crystals: GUESS_CRYSTALS }, $setOnInsert: { plays: [] } };
    try {
        return await GuessPlayer.findOneAndUpdate(
            keys,
            update,
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
    } catch (error) {
        if (error && error.code === 11000) {
            return GuessPlayer.findOneAndUpdate(
                keys,
                { $inc: { wins: 1, crystals: GUESS_CRYSTALS } },
                { returnDocument: 'after' }
            );
        }
        throw error;
    }
}

async function readPlayer(userId, guildId) {
    const keys = playerKeys(userId, guildId);
    if (!keys) return null;
    const doc = await GuessPlayer.findOne(keys).lean();
    if (!doc) return { userID: keys.userID, guildID: keys.guildID, wins: 0, crystals: 0 };
    return {
        userID: String(doc.userID),
        guildID: String(doc.guildID),
        wins: Math.max(0, Math.floor(Number(doc.wins)) || 0),
        crystals: Math.max(0, Math.floor(Number(doc.crystals)) || 0),
    };
}

async function leaderboardDocs(guildId) {
    const guildID = snowflake(guildId);
    if (!guildID) return [];
    const rows = await GuessPlayer.find({ guildID, wins: { $gt: 0 } })
        .sort({ wins: -1, userID: 1 })
        .limit(50)
        .lean();
    return rows.map((row) => ({
        userID: String(row.userID),
        wins: Math.max(0, Math.floor(Number(row.wins)) || 0),
        crystals: Math.max(0, Math.floor(Number(row.crystals)) || 0),
    }));
}

module.exports = {
    resetCache,
    mediaRecord,
    countAnime,
    listIds,
    loadAnime,
    saveAnime,
    loadGuild,
    saveGuild,
    takeScreenshot,
    consumePlay,
    refundPlay,
    awardWin,
    readPlayer,
    leaderboardDocs,
    isStale,
};
