const { withTimeout, createCache } = require('../anime/cache');
let inventory = null;
let inventoryUntil = 0;
let countValue = null;
let countUntil = 0;
let countJob = null;
let inventoryJob = null;
const localAnime = createCache({ max: 400, ttlMs: 24 * 60 * 60 * 1000 });
function resetCache() {
    inventory = null; inventoryUntil = 0; countValue = null; countUntil = 0;
    localAnime.clear();
}
const getGuessAnime = require('../Models/GuessAnime').get;
const GuessGuild = require('../Models/GuessGuild');
const GuessPlayer = require('../Models/GuessPlayer');
const { noteWrite } = require('../db/evict');
const { snowflake } = require('../utils/safeId');
const {
    GUESS_CRYSTALS, GUESS_PLAY_LIMIT, GUESS_PLAYER_RECENT_LIMIT, GUESS_SHIELD_COST,
    GUESS_GIFT_DAILY_MAX, GUESS_GIFT_MIN_WINS, GUESS_CHARACTER_RECENT_LIMIT,
} = require('./constants');
const { seasonKey, dayKey, parseSeason } = require('./season');
const { pending: pendingAchievements } = require('./achievements');
const { ids, cleanHistory } = require('./families');
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
        guessContextVersion: [1, 2].includes(media.guessContextVersion) ? media.guessContextVersion : 0,
        relatedIds: ids(media.relatedIds),
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

// Pool rows carry what selection filters on: status for refresh timing,
// genres and start year for genre and era packs.
function poolRow(doc) {
    const year = Number(doc.media?.startDate?.year);
    return {
        anilistId: String(doc.anilistId),
        relatedIds: ids(doc.media?.relatedIds),
        guessContextVersion: doc.media?.guessContextVersion || 0,
        fetchedAt: doc.fetchedAt,
        status: typeof doc.media?.status === 'string' ? doc.media.status : '',
        genres: Array.isArray(doc.media?.genres) ? doc.media.genres.filter((g) => typeof g === 'string') : [],
        year: Number.isInteger(year) ? year : null,
    };
}

async function listPool() {
    const localRows = () => localAnime.keys().map((id) => localAnime.get(id)).filter(Boolean).map(poolRow);
    const GuessAnime = guessAnime();
    if (!GuessAnime) return localRows();
    if (inventory && inventoryUntil > Date.now()) return inventory.slice();
    if (inventoryJob) return inventoryJob;
    inventoryJob = (async () => {
        try {
            const rows = await withTimeout(GuessAnime.find({ 'screenshots.0': { $exists: true } }, {
                anilistId: 1, 'media.relatedIds': 1, 'media.guessContextVersion': 1, fetchedAt: 1,
                'media.status': 1, 'media.genres': 1, 'media.startDate.year': 1,
            }).sort({ anilistId: 1 }).limit(12000).maxTimeMS(200).lean(), 250);
            const merged = new Map(rows.map((row) => [String(row.anilistId), poolRow(row)]));
            for (const row of localRows()) merged.set(row.anilistId, row);
            inventory = [...merged.values()].sort((a, b) => Number(a.anilistId) - Number(b.anilistId)).slice(0, 12000);
            inventoryUntil = Date.now() + 60000;
            return inventory.slice();
        } catch {
            // Preserve a usable previous inventory during a transient DB failure.
            inventory = inventory || localRows();
            inventoryUntil = Date.now() + 5000;
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
    return { recentIds, shown, recentFranchises: cleanHistory(doc?.recentFranchises) };
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
    const recentFranchises = cleanHistory(state?.recentFranchises);
    await GuessGuild.findOneAndUpdate(
        { guildID },
        { $set: { recentIds, shown, recentFranchises } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    return { recentIds, shown, recentFranchises };
}

// Serialize the small read/update per server so simultaneous personal rounds
// cannot overwrite each other's screenshot history. The bot runs one process.
const guildWork = new Map();
async function withGuildSelection(guildId, work) {
    const key = snowflake(guildId);
    if (!key || guildWork.size >= 4000 && !guildWork.has(key)) return null;
    const current = guildWork.get(key) || { tail: Promise.resolve(), count: 0 };
    if (current.count >= 8) return null;
    current.count += 1;
    guildWork.set(key, current);
    const job = current.tail.catch(() => {}).then(work);
    current.tail = job;
    try { return await job; }
    finally { current.count -= 1; if (!current.count) guildWork.delete(key); }
}
async function takeScreenshot(guildId, doc, random = Math.random) {
    return withGuildSelection(guildId, () => reserveScreenshot(guildId, doc, random));
}

async function loadPlayerHistory(userId, guildId) {
    const keys = playerKeys(userId, guildId);
    if (!keys) return [];
    const player = await GuessPlayer.findOne(keys, { recentFranchises: 1 }).maxTimeMS(1000).lean();
    return cleanHistory(player?.recentFranchises, GUESS_PLAYER_RECENT_LIMIT);
}

// Only called inside withGuildSelection, including the candidate decision.
// Reserve before posting: a failed Discord send can conservatively retain a
// history entry, but cannot create a repeat exploit. The play itself is refunded.
async function reserveScreenshot(guildId, doc, random = Math.random, options = {}) {
    const guildID = snowflake(guildId);
    const anilistId = animeKey(doc && doc.anilistId);
    if (!guildID || !anilistId) return null;
    const guild = options.guild || await loadGuild(guildID);
    const current = (guild.shown.find((entry) => entry.animeId === anilistId) || {}).urls || [];
    const shot = pickScreenshot(doc.screenshots, current, random);
    if (!shot) return null;
    const next = rememberUse(guild, anilistId, shot.shown);
    next.recentFranchises = options.guildHistory || guild.recentFranchises;
    if (options.userId) {
        const keys = playerKeys(options.userId, guildID);
        if (!keys) return null;
        await GuessPlayer.updateOne(keys, {
            $set: { recentFranchises: cleanHistory(options.playerHistory, GUESS_PLAYER_RECENT_LIMIT) },
        }, { upsert: true });
    }
    await saveGuild(guildID, next);
    return {
        media: doc.media,
        url: shot.url,
        screenshots: doc.screenshots.slice(),
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

async function spendCrystals(userId, guildId, amount) {
    const keys = playerKeys(userId, guildId);
    if (!keys || !Number.isSafeInteger(amount) || amount <= 0) throw new TypeError('Invalid crystal purchase.');
    // Conditional decrement is atomic across simultaneous rounds/channels.
    const result = await GuessPlayer.updateOne({ ...keys, crystals: { $gte: amount } }, { $inc: { crystals: -amount } });
    return result.modifiedCount === 1;
}

async function refundCrystals(userId, guildId, amount) {
    const keys = playerKeys(userId, guildId);
    if (!keys || !Number.isSafeInteger(amount) || amount <= 0) throw new TypeError('Invalid crystal refund.');
    await GuessPlayer.updateOne(keys, { $inc: { crystals: amount } });
}

// Close the previous season once per server: its top three get a title. Runs
// before any win in a new season, so their seasonWins are still intact.
const seasonClosed = new Map();
const seasonJobs = new Map();
async function closeSeason(guildId, now = Date.now()) {
    const guildID = snowflake(guildId);
    if (!guildID) return null;
    const current = seasonKey(now);
    if (seasonClosed.get(guildID) === current) return null;
    if (seasonJobs.has(guildID)) return seasonJobs.get(guildID);
    const job = (async () => {
        try { await GuessGuild.updateOne({ guildID }, { $setOnInsert: { season: current } }, { upsert: true }); }
        catch (error) { if (error.code !== 11000) throw error; }
        const before = await GuessGuild.findOneAndUpdate(
            { guildID, season: { $ne: current } },
            { $set: { season: current } },
            { returnDocument: 'before' },
        ).lean();
        const previous = before && parseSeason(before.season) ? before.season : '';
        const awarded = [];
        if (previous) {
            const top = await GuessPlayer.find({ guildID, season: previous, seasonWins: { $gt: 0 } })
                .sort({ seasonWins: -1, userID: 1 }).limit(3).lean();
            for (const [index, row] of top.entries()) {
                await GuessPlayer.updateOne(
                    { userID: row.userID, guildID, 'titles.season': { $ne: previous } },
                    { $push: { titles: { season: previous, rank: index + 1 } } },
                );
                awarded.push({ userID: String(row.userID), rank: index + 1 });
            }
        }
        if (seasonClosed.size >= 5000) seasonClosed.clear();
        seasonClosed.set(guildID, current);
        return { season: previous, awarded };
    })().finally(() => seasonJobs.delete(guildID));
    seasonJobs.set(guildID, job);
    return job;
}

function resetSeasonCache() { seasonClosed.clear(); }

// options.streak: a personal-round win, which also extends the win streak.
// options.counters: achievement counters to add, for example { fastWins: 1 }.
// options.pack: the pack this win was played in, if any.
async function awardWin(userId, guildId, crystals = GUESS_CRYSTALS, options = {}) {
    if (!Number.isSafeInteger(crystals) || crystals < 0) throw new TypeError('Invalid crystal reward.');
    const keys = playerKeys(userId, guildId);
    if (!keys) throw new TypeError('A user id was not provided.');
    const now = Number.isFinite(options?.now) ? options.now : Date.now();
    const season = seasonKey(now);
    try { await closeSeason(keys.guildID, now); }
    catch (error) { /* A failed title hand-out retries on the next win. The win still counts. */ }
    const inc = options && options.streak === true ? { wins: 1, crystals, streak: 1 } : { wins: 1, crystals };
    for (const [name, value] of Object.entries(options?.counters || {})) {
        if (Number.isSafeInteger(value) && value > 0 && /^[a-zA-Z]+$/.test(name)) inc[`counters.${name}`] = value;
    }
    // A first win in a new season starts that season's count from zero.
    await GuessPlayer.updateOne({ ...keys, season: { $ne: season } }, { $set: { season, seasonWins: 0 } }).catch(() => {});
    inc.seasonWins = 1;
    const update = { $inc: inc };
    if (typeof options?.pack === 'string' && /^[a-z0-9-]{1,30}$/.test(options.pack)) update.$addToSet = { packsWon: options.pack };
    let doc;
    try {
        doc = await GuessPlayer.findOneAndUpdate(
            keys,
            { ...update, $setOnInsert: { plays: [], season } },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
    } catch (error) {
        if (!error || error.code !== 11000) throw error;
        doc = await GuessPlayer.findOneAndUpdate(keys, update, { returnDocument: 'after' });
    }
    const streak = Math.max(0, Math.floor(Number(doc && doc.streak)) || 0);
    if (inc.streak && streak > (Number(doc && doc.bestStreak) || 0)) {
        // $max keeps this safe when two wins land at once.
        await GuessPlayer.updateOne(keys, { $max: { bestStreak: streak } });
        if (doc) doc.bestStreak = streak;
    }
    return doc;
}

// A personal round ended without a win. A held Streak Shield is used up and
// the streak survives; otherwise the streak resets. A give up is counted either way.
async function endStreak(userId, guildId, { gaveUp = false } = {}) {
    const keys = playerKeys(userId, guildId);
    if (!keys) throw new TypeError('A user id was not provided.');
    const shieldInc = { shields: -1, 'counters.shieldsUsed': 1 };
    if (gaveUp) shieldInc.gaveUp = 1;
    const shielded = await GuessPlayer.findOneAndUpdate(
        { ...keys, shields: { $gte: 1 }, streak: { $gt: 0 } },
        { $inc: shieldInc },
        { returnDocument: 'after' },
    ).lean();
    if (shielded) return { shielded: true, streak: Math.max(0, Math.floor(Number(shielded.streak)) || 0) };
    const update = { $set: { streak: 0 } };
    if (gaveUp) update.$inc = { gaveUp: 1 };
    await GuessPlayer.updateOne(keys, update);
    return { shielded: false, streak: 0 };
}

// Buy one Streak Shield. Only one can be held, and the purchase is atomic.
async function buyShield(userId, guildId, cost = GUESS_SHIELD_COST) {
    const keys = playerKeys(userId, guildId);
    if (!keys) throw new TypeError('A user id was not provided.');
    const result = await GuessPlayer.updateOne(
        { ...keys, crystals: { $gte: cost }, shields: { $not: { $gte: 1 } } },
        { $inc: { crystals: -cost, shields: 1 } },
    );
    if (result.modifiedCount === 1) return { ok: true };
    const player = await readPlayer(userId, guildId);
    if (player.shields >= 1) return { ok: false, owned: true };
    return { ok: false, short: cost - player.crystals };
}

// Send crystals to another member. No fee. The sender needs a few wins first
// (so a fresh alt cannot farm), and can send up to the daily cap per Pacific day.
async function giftCrystals(fromId, toId, guildId, amount, now = Date.now()) {
    const from = playerKeys(fromId, guildId);
    const to = playerKeys(toId, guildId);
    if (!from || !to || from.userID === to.userID) throw new TypeError('Invalid gift.');
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > GUESS_GIFT_DAILY_MAX) throw new TypeError('Invalid gift amount.');
    const today = dayKey(now);
    await GuessPlayer.updateOne({ ...from, giftDay: { $ne: today } }, { $set: { giftDay: today, giftedToday: 0 } });
    const result = await GuessPlayer.updateOne({
        ...from, giftDay: today, wins: { $gte: GUESS_GIFT_MIN_WINS },
        crystals: { $gte: amount }, giftedToday: { $lte: GUESS_GIFT_DAILY_MAX - amount },
    }, { $inc: { crystals: -amount, giftedToday: amount, 'counters.giftedTotal': amount } });
    if (result.modifiedCount !== 1) {
        const doc = await GuessPlayer.findOne(from).lean();
        const sent = doc?.giftDay === today ? Math.max(0, Number(doc.giftedToday) || 0) : 0;
        if (!doc || (Number(doc.wins) || 0) < GUESS_GIFT_MIN_WINS) return { ok: false, wins: true };
        if ((Number(doc.crystals) || 0) < amount) return { ok: false, short: true, balance: Math.max(0, Number(doc.crystals) || 0) };
        return { ok: false, cap: true, left: Math.max(0, GUESS_GIFT_DAILY_MAX - sent) };
    }
    try {
        await GuessPlayer.updateOne(to, { $inc: { crystals: amount } }, { upsert: true, setDefaultsOnInsert: true });
    } catch (error) {
        if (error.code === 11000) await GuessPlayer.updateOne(to, { $inc: { crystals: amount } });
        else {
            // Return the crystals rather than lose them.
            await GuessPlayer.updateOne(from, { $inc: { crystals: amount, giftedToday: -amount, 'counters.giftedTotal': -amount } });
            throw error;
        }
    }
    return { ok: true };
}

// Duels: the winner takes the whole pot. Duels never change wins or streaks.
async function settleDuel(winnerId, loserId, guildId, pot) {
    const winner = playerKeys(winnerId, guildId);
    const loser = playerKeys(loserId, guildId);
    if (!winner || !loser || !Number.isSafeInteger(pot) || pot < 0) throw new TypeError('Invalid duel result.');
    await GuessPlayer.updateOne(winner, { $inc: { crystals: pot, 'counters.duelWins': 1 } }, { upsert: true, setDefaultsOnInsert: true })
        .catch((error) => { if (error.code !== 11000) throw error; return GuessPlayer.updateOne(winner, { $inc: { crystals: pot, 'counters.duelWins': 1 } }); });
    await GuessPlayer.updateOne(loser, { $inc: { 'counters.duelLosses': 1 } });
}

// Record any newly earned achievements and pay their bonus. Safe to repeat:
// each one is added only when it is missing, together with its reward.
async function unlockAchievements(userId, guildId) {
    const keys = playerKeys(userId, guildId);
    if (!keys) return [];
    const player = await readPlayer(userId, guildId);
    const unlocked = [];
    for (const entry of pendingAchievements(player)) {
        const result = await GuessPlayer.updateOne(
            { ...keys, achievements: { $ne: entry.id } },
            { $push: { achievements: entry.id }, $inc: { crystals: entry.reward } },
        );
        if (result.modifiedCount === 1) unlocked.push(entry);
    }
    return unlocked;
}

const COUNTERS = ['noHintWins', 'fastWins', 'wagerWins', 'bigWagerWins', 'duelWins', 'duelLosses',
    'characterWins', 'giftedTotal', 'shieldsUsed'];

function count(value) { return Math.max(0, Math.floor(Number(value)) || 0); }

function playerRow(keys, doc, now) {
    const current = seasonKey(now);
    const counters = {};
    for (const name of COUNTERS) counters[name] = count(doc?.counters?.[name]);
    return {
        userID: String(doc?.userID || keys.userID),
        guildID: String(doc?.guildID || keys.guildID),
        wins: count(doc?.wins),
        crystals: count(doc?.crystals),
        streak: count(doc?.streak),
        bestStreak: Math.max(count(doc?.bestStreak), count(doc?.streak)),
        gaveUp: count(doc?.gaveUp),
        season: current,
        seasonWins: doc?.season === current ? count(doc.seasonWins) : 0,
        titles: (doc?.titles || []).filter((title) => parseSeason(title?.season))
            .map((title) => ({ season: title.season, rank: count(title.rank) })),
        shields: Math.min(1, count(doc?.shields)),
        achievements: (doc?.achievements || []).filter((id) => typeof id === 'string'),
        packsWon: (doc?.packsWon || []).filter((id) => typeof id === 'string'),
        counters,
    };
}

async function readPlayer(userId, guildId, now = Date.now()) {
    const keys = playerKeys(userId, guildId);
    if (!keys) return null;
    const doc = await GuessPlayer.findOne(keys).lean();
    return playerRow(keys, doc, now);
}

// Character rounds remember the last few characters shown in this server.
async function loadRecentCharacters(guildId) {
    const guildID = snowflake(guildId);
    if (!guildID) return [];
    const doc = await GuessGuild.findOne({ guildID }, { recentCharacters: 1 }).maxTimeMS(1000).lean();
    return (doc?.recentCharacters || []).filter((id) => animeKey(id));
}

async function rememberCharacter(guildId, characterId) {
    const guildID = snowflake(guildId);
    const id = animeKey(characterId);
    if (!guildID || !id) return;
    await GuessGuild.updateOne({ guildID }, {
        $push: { recentCharacters: { $each: [id], $position: 0, $slice: GUESS_CHARACTER_RECENT_LIMIT } },
    }, { upsert: true });
}

// options.season: rank by this season's wins instead of all-time wins.
async function leaderboardDocs(guildId, options = {}) {
    const guildID = snowflake(guildId);
    if (!guildID) return [];
    const season = options && options.season ? String(options.season) : '';
    const filter = season ? { guildID, season, seasonWins: { $gt: 0 } } : { guildID, wins: { $gt: 0 } };
    const sort = season ? { seasonWins: -1, userID: 1 } : { wins: -1, userID: 1 };
    const rows = await GuessPlayer.find(filter, { userID: 1, wins: 1, seasonWins: 1, crystals: 1, titles: 1 })
        .sort(sort)
        .limit(50)
        .lean();
    return rows.map((row) => ({
        userID: String(row.userID),
        wins: count(season ? row.seasonWins : row.wins),
        crystals: count(row.crystals),
        titles: Array.isArray(row.titles) ? row.titles : [],
    }));
}

module.exports = {
    resetCache,
    mediaRecord,
    countAnime,
    listPool,
    withGuildSelection,
    reserveScreenshot,
    loadPlayerHistory,
    loadAnime,
    saveAnime,
    loadGuild,
    saveGuild,
    takeScreenshot,
    consumePlay,
    refundPlay,
    awardWin,
    endStreak,
    closeSeason,
    resetSeasonCache,
    buyShield,
    giftCrystals,
    settleDuel,
    unlockAchievements,
    loadRecentCharacters,
    rememberCharacter,
    spendCrystals,
    refundCrystals,
    readPlayer,
    leaderboardDocs,
    isStale,
};
