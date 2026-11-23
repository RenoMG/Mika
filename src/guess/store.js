const GuessAnime = require('../Models/GuessAnime');
const GuessGuild = require('../Models/GuessGuild');
const GuessPlayer = require('../Models/GuessPlayer');
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

async function countAnime() {
    return GuessAnime.countDocuments();
}

async function listIds() {
    const rows = await GuessAnime.find({}, { anilistId: 1 }).lean();
    const ids = [];
    for (const row of rows) {
        const id = animeKey(row && row.anilistId);
        if (id) ids.push(id);
    }
    return ids;
}

async function loadAnime(anilistId) {
    const id = animeKey(anilistId);
    if (!id) return null;
    const doc = await GuessAnime.findOne({ anilistId: id }).lean();
    return plainAnime(doc);
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
    };
    await GuessAnime.findOneAndUpdate(
        { anilistId: record.id },
        { $set: written },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    return plainAnime(written);
}

async function loadGuild(guildId) {
    const guildID = snowflake(guildId);
    if (!guildID) return { recentIds: [], shown: [] };
    const doc = await GuessGuild.findOne({ guildID }).lean();
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

async function takeScreenshot(guildId, doc, random = Math.random) {
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
    const existing = await GuessPlayer.findOne(keys).lean();
    const judged = judgePlays(stampsOf(existing), now);
    if (!judged.allowed) return judged;
    const stamp = now;
    const plays = [...judged.plays, stamp].slice(-GUESS_PLAY_LIMIT).map((time) => new Date(time));
    await GuessPlayer.updateOne(
        keys,
        { $set: { plays }, $setOnInsert: { wins: 0, crystals: 0 } },
        { upsert: true }
    );
    return { allowed: true, stamp, plays: [...judged.plays, stamp] };
}

async function refundPlay(userId, guildId, stamp) {
    const keys = playerKeys(userId, guildId);
    if (!keys || !Number.isFinite(stamp)) return;
    const existing = await GuessPlayer.findOne(keys);
    if (!existing) return;
    existing.plays = (existing.plays || []).filter((value) => {
        const time = value instanceof Date ? value.getTime() : Date.parse(value);
        return time !== stamp;
    });
    await existing.save();
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
