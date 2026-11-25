const crypto = require('node:crypto');
const AnilistLink = require('../Models/AnilistLink');
const { anilistQuery } = require('./client');
const {
    cleanDetails,
    cleanNotes,
    cleanScore,
    fuzzyDate,
    wholeNumber,
} = require('./details');
const { applyEntities, ENTITY_KINDS, MAX_ENTITIES, applyFavorites, MAX_FAVORITES, readFavorites, readEntities } = require('./favorites');
const { applyCustomLists, cleanListName, readCustomLists, MAX_LISTS, MAX_LIST_ENTRIES } = require('./customLists');
const { STATUSES, readAll, writeLists } = require('./library');
const { anilistId, snowflake } = require('./ids');
const { containsSlur, neutralize } = require('./text');

// Importing someone's public AniList anime list. Ownership is proved by
// putting a one-time code in the AniList bio; Mika reads the bio through the
// public API, so no AniList sign-in is needed.
//
// Everything AniList returns is untrusted input. Nothing is evaluated or
// rendered as-is: ids must be digits, numbers must be in range, statuses must
// be one of six known values, and text is stripped of mentions, links,
// markdown, and control characters, then length-capped. Text that trips the
// slur filter is dropped. The username goes to AniList only as a GraphQL
// variable, never spliced into the query.

const USERNAME_RE = /^[A-Za-z0-9_-]{2,20}$/;
const CODE_TTL_MS = 30 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 6;
const IMPORT_COOLDOWN_MS = 10 * 60 * 1000;
const PER_CHUNK = 250;
const MAX_CHUNKS = 12;
const MAX_ENTRIES_READ = PER_CHUNK * MAX_CHUNKS;
const REQUEST_TIMEOUT_MS = 20000;
const STATUS_MAP = Object.freeze({
    CURRENT: 'watching',
    PLANNING: 'planning',
    COMPLETED: 'completed',
    REPEATING: 'rewatching',
    PAUSED: 'paused',
    DROPPED: 'dropped',
});

const USER_QUERY = `query ($name: String) {
  User(name: $name) {
    id
    name
    about
    favourites {
      anime(perPage: 25) { nodes { id isAdult title { romaji english } } }
      characters(perPage: 25) { nodes { id name { full native } } }
      staff(perPage: 25) { nodes { id name { full native } } }
      studios(perPage: 25) { nodes { id name } }
    }
  }
}`;

const LIST_QUERY = `query ($userId: Int, $chunk: Int, $perChunk: Int) {
  MediaListCollection(userId: $userId, type: ANIME, chunk: $chunk, perChunk: $perChunk, forceSingleCompletedList: true) {
    hasNextChunk
    lists {
      name
      isCustomList
      entries {
        status
        progress
        repeat
        notes
        private
        score(format: POINT_10_DECIMAL)
        startedAt { year month day }
        completedAt { year month day }
        updatedAt
        createdAt
        media {
          id
          isAdult
          format
          episodes
          duration
          genres
          seasonYear
          startDate { year }
          title { romaji english }
        }
      }
    }
  }
}`;

const MESSAGES = Object.freeze({
    username: 'That AniList username does not look right. It is 2 to 20 letters, numbers, - or _.',
    noUser: "AniList has no user with that name, or the profile is private.",
    unavailable: 'AniList is not answering right now. Try again in a few minutes.',
    noCode: 'Start with /import anilist first. Your code may have expired.',
    codeMissing: "I couldn't find your code in that AniList bio yet. Save the bio on AniList, wait a moment, then press Verify again.",
    tooMany: 'Too many tries. Run /import anilist again for a new code.',
    cooldown: 'You imported recently. Try again in a few minutes.',
    busy: 'Another import is running. Try again in a minute.',
    emptyList: 'That AniList anime list is empty, or it is private.',
});

function validUsername(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return USERNAME_RE.test(text) ? text : null;
}

function makeCode(random = crypto.randomBytes) {
    // 8 characters from an alphabet without look-alikes.
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = random(8);
    let out = '';
    for (const byte of bytes) out += alphabet[byte % alphabet.length];
    return `mika-${out}`;
}

function titleOf(media) {
    const titles = media && media.title && typeof media.title === 'object' ? media.title : {};
    const english = typeof titles.english === 'string' ? titles.english : '';
    const romaji = typeof titles.romaji === 'string' ? titles.romaji : '';
    return neutralize(english || romaji, 200);
}

function entityName(node) {
    if (!node || typeof node !== 'object') return '';
    if (typeof node.name === 'string') return node.name;
    const name = node.name && typeof node.name === 'object' ? node.name : {};
    return (typeof name.full === 'string' && name.full) || (typeof name.native === 'string' && name.native) || '';
}

function cleanEntities(nodes, limit) {
    const list = [];
    for (const node of Array.isArray(nodes) ? nodes : []) {
        const id = anilistId(node && node.id);
        const name = neutralize(entityName(node), 100);
        if (!id || !name || containsSlur(name) || list.some((item) => item.id === id)) continue;
        list.push({ id, name });
        if (list.length >= limit) break;
    }
    return list;
}

// The user lookup, reduced to what Mika keeps. `about` is only searched for
// the code and is never stored or shown.
function readUser(body) {
    const user = body && body.data ? body.data.User : null;
    if (!user || typeof user !== 'object') return null;
    const id = anilistId(user.id);
    const name = validUsername(user.name);
    if (!id || !name) return null;
    const about = typeof user.about === 'string' ? user.about.slice(0, 20000) : '';
    const favs = user.favourites && typeof user.favourites === 'object' ? user.favourites : {};
    const anime = [];
    for (const node of (favs.anime && Array.isArray(favs.anime.nodes)) ? favs.anime.nodes : []) {
        const showId = anilistId(node && node.id);
        const title = titleOf(node);
        if (!showId || !title || node.isAdult === true || anime.some((item) => item.anilistId === showId)) continue;
        anime.push({ anilistId: showId, title });
        if (anime.length >= MAX_FAVORITES) break;
    }
    return {
        id,
        name,
        about,
        favorites: {
            anime,
            character: cleanEntities(favs.characters && favs.characters.nodes, MAX_ENTITIES),
            staff: cleanEntities(favs.staff && favs.staff.nodes, MAX_ENTITIES),
            studio: cleanEntities(favs.studios && favs.studios.nodes, MAX_ENTITIES),
        },
    };
}

function hasCode(about, code) {
    return typeof about === 'string' && typeof code === 'string' && code.length >= 10 && about.includes(code);
}

function unixDate(value, now) {
    const seconds = wholeNumber(value, 1, 4102444800);
    if (!seconds) return null;
    const at = new Date(seconds * 1000);
    return at.getTime() <= now + 2 * 86400000 ? at : null;
}

// One AniList list entry to a Mika row, or null when anything required is
// missing or invalid.
function readEntry(raw, now = Date.now()) {
    if (!raw || typeof raw !== 'object') return null;
    const status = STATUS_MAP[raw.status];
    const media = raw.media && typeof raw.media === 'object' ? raw.media : null;
    if (!status || !media || media.isAdult === true || raw.private === true) return null;
    const id = anilistId(media.id);
    const title = titleOf(media);
    if (!id || !title) return null;
    const details = cleanDetails({
        episodes: media.episodes,
        duration: media.duration,
        format: media.format,
        genres: media.genres,
        year: media.seasonYear || (media.startDate && media.startDate.year),
        progress: raw.progress,
        score: cleanScore(raw.score),
        notes: cleanNotes(raw.notes),
        rewatches: raw.repeat,
        startedAt: fuzzyDate(raw.startedAt, now),
        completedAt: fuzzyDate(raw.completedAt, now),
        updatedAt: unixDate(raw.updatedAt, now),
    }, now);
    const added = unixDate(raw.createdAt, now) || unixDate(raw.updatedAt, now);
    const row = { ...details, anilistId: id, title };
    if (added) row.addedAt = added;
    if (status === 'completed' && !row.completedAt) row.completedAt = row.updatedAt || added || new Date(now);
    return { status, row };
}

function readCollection(body, now = Date.now()) {
    const collection = body && body.data ? body.data.MediaListCollection : null;
    if (!collection || typeof collection !== 'object' || !Array.isArray(collection.lists)) return null;
    const entries = [];
    const custom = [];
    for (const list of collection.lists.slice(0, 64)) {
        if (!list || typeof list !== 'object' || !Array.isArray(list.entries)) continue;
        const rows = [];
        for (const raw of list.entries.slice(0, MAX_ENTRIES_READ)) {
            const parsed = readEntry(raw, now);
            if (parsed) rows.push(parsed);
        }
        if (list.isCustomList === true) {
            const name = cleanListName(list.name);
            if (name) custom.push({ name, entries: rows.map((item) => ({ anilistId: item.row.anilistId, title: item.row.title })) });
        } else {
            entries.push(...rows);
        }
    }
    return { entries, custom, hasNextChunk: collection.hasNextChunk === true };
}

async function fetchUser(name, { query = anilistQuery } = {}) {
    const body = await query(USER_QUERY, { name }, { timeoutMs: REQUEST_TIMEOUT_MS });
    if (!body) return { ok: false, reason: 'unavailable' };
    if (body.notFound) return { ok: false, reason: 'noUser' };
    const user = readUser(body);
    if (!user) return { ok: false, reason: 'noUser' };
    return { ok: true, user };
}

async function fetchCollection(userId, { query = anilistQuery, now = Date.now() } = {}) {
    const entries = [];
    const custom = new Map();
    for (let chunk = 1; chunk <= MAX_CHUNKS; chunk += 1) {
        const body = await query(LIST_QUERY, { userId: Number(userId), chunk, perChunk: PER_CHUNK }, { timeoutMs: REQUEST_TIMEOUT_MS });
        if (!body) return { ok: false, reason: 'unavailable' };
        if (body.notFound) return { ok: false, reason: 'emptyList' };
        const page = readCollection(body, now);
        if (!page) return chunk === 1 ? { ok: false, reason: 'emptyList' } : { ok: false, reason: 'unavailable' };
        entries.push(...page.entries);
        for (const list of page.custom) {
            const key = list.name.toLowerCase();
            const current = custom.get(key) || { name: list.name, entries: [] };
            current.entries.push(...list.entries);
            custom.set(key, current);
        }
        if (!page.hasNextChunk || entries.length >= MAX_ENTRIES_READ) break;
    }
    return { ok: true, entries, custom: [...custom.values()] };
}

function recencyMs(row) {
    for (const key of ['updatedAt', 'completedAt', 'addedAt']) {
        const at = row[key];
        if (at instanceof Date && !Number.isNaN(at.getTime())) return at.getTime();
    }
    return 0;
}

// Merges AniList rows into the profile. `merge` keeps shows that are only on
// Mika and lets AniList win for shows on both. `replace` makes the six status
// lists match AniList. The 💌 mark and sender of a recommended show are kept
// either way. Over-cap lists keep their most recently updated shows.
function applyImport(profile, imported, { mode = 'merge', favorites = null } = {}) {
    const current = readAll(profile);
    const keepMarks = new Map();
    for (const status of STATUSES) {
        for (const item of current[status.id]) {
            if (item.recommended) keepMarks.set(item.anilistId, { recommended: true, fromUserId: item.fromUserId || '' });
        }
    }
    const incoming = new Map();
    for (const { status, row } of imported.entries || []) {
        if (!incoming.has(row.anilistId)) incoming.set(row.anilistId, { status, row });
    }
    const next = {};
    for (const status of STATUSES) next[status.id] = [];
    if (mode !== 'replace') {
        for (const status of STATUSES) {
            for (const item of current[status.id]) {
                if (!incoming.has(item.anilistId)) next[status.id].push(item);
            }
        }
    }
    for (const { status, row } of incoming.values()) {
        next[status].push({ ...row, ...(keepMarks.get(row.anilistId) || {}) });
    }
    const counts = {};
    let skipped = 0;
    for (const status of STATUSES) {
        const list = next[status.id];
        if (list.length > status.max) {
            list.sort((a, b) => recencyMs(b) - recencyMs(a));
            skipped += list.length - status.max;
            next[status.id] = list.slice(0, status.max);
        }
        // Stored oldest first, like rows added one at a time.
        next[status.id].sort((a, b) => recencyMs(a) - recencyMs(b));
        counts[status.id] = next[status.id].length;
    }
    writeLists(profile, next);

    let customAdded = 0;
    if (Array.isArray(imported.custom) && imported.custom.length) {
        const lists = readCustomLists(profile);
        for (const list of imported.custom) {
            const index = lists.findIndex((item) => item.name.toLowerCase() === list.name.toLowerCase());
            const entries = [];
            for (const entry of list.entries) {
                if (entries.some((row) => row.anilistId === entry.anilistId)) continue;
                entries.push(entry);
                if (entries.length >= MAX_LIST_ENTRIES) break;
            }
            if (index >= 0) {
                const merged = lists[index].entries.slice();
                for (const entry of entries) {
                    if (merged.length >= MAX_LIST_ENTRIES) break;
                    if (!merged.some((row) => row.anilistId === entry.anilistId)) merged.push(entry);
                }
                lists[index] = { ...lists[index], entries: merged };
            } else if (lists.length < MAX_LISTS) {
                lists.push({ id: crypto.randomBytes(4).toString('hex'), name: list.name, entries, createdAt: new Date() });
                customAdded += 1;
            }
        }
        applyCustomLists(profile, lists);
    }

    const favoriteCounts = {};
    if (favorites) {
        // AniList favorites fill empty slots only; anything already picked on Mika stays first.
        const anime = readFavorites(profile).filter((item) => anilistId(item.anilistId));
        for (const item of favorites.anime || []) {
            if (anime.length >= MAX_FAVORITES) break;
            if (!anime.some((row) => row.anilistId === item.anilistId)) anime.push(item);
        }
        applyFavorites(profile, anime);
        favoriteCounts.anime = anime.length;
        for (const kind of Object.keys(ENTITY_KINDS)) {
            const list = readEntities(profile, kind);
            for (const item of favorites[kind] || []) {
                if (list.length >= MAX_ENTITIES) break;
                if (!list.some((row) => row.id === item.id)) list.push(item);
            }
            applyEntities(profile, kind, list);
            favoriteCounts[kind] = list.length;
        }
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return { counts, total, skipped, customAdded, favorites: favoriteCounts, imported: incoming.size };
}

// --- Verification flow ---------------------------------------------------

async function startLink(userId, rawName, { Link = AnilistLink, now = Date.now(), mode = 'merge' } = {}) {
    const id = snowflake(userId);
    const username = validUsername(rawName);
    if (!id) return { ok: false, reason: 'noUser' };
    if (!username) return { ok: false, reason: 'username' };
    const code = makeCode();
    await Link.findOneAndUpdate(
        { userId: id },
        { $set: { username, code, mode: mode === 'replace' ? 'replace' : 'merge', attempts: 0, expiresAt: new Date(now + CODE_TTL_MS) } },
        { upsert: true, setDefaultsOnInsert: true },
    );
    return { ok: true, code, username, expiresAt: new Date(now + CODE_TTL_MS) };
}

// Claims one verification attempt and returns the pending row.
async function claimAttempt(userId, { Link = AnilistLink, now = Date.now() } = {}) {
    const id = snowflake(userId);
    if (!id) return { ok: false, reason: 'noCode' };
    const row = await Link.findOneAndUpdate(
        { userId: id, expiresAt: { $gt: new Date(now) }, attempts: { $lt: MAX_VERIFY_ATTEMPTS } },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' },
    ).lean();
    if (row) return { ok: true, link: row };
    const any = await Link.findOne({ userId: id }).lean();
    if (any && any.expiresAt > new Date(now) && any.attempts >= MAX_VERIFY_ATTEMPTS) return { ok: false, reason: 'tooMany' };
    return { ok: false, reason: 'noCode' };
}

const running = new Set();
const lastImport = new Map();
const MAX_RUNNING = 2;

function importGate(userId, now = Date.now()) {
    const last = lastImport.get(userId) || 0;
    if (now - last < IMPORT_COOLDOWN_MS) return 'cooldown';
    if (running.has(userId) || running.size >= MAX_RUNNING) return 'busy';
    return null;
}

// Checks the code, then imports. `profile` is the caller's own Mongoose
// document. Returns a summary or a reason key from MESSAGES.
async function verifyAndImport(userId, profile, deps = {}) {
    const id = snowflake(userId);
    const now = deps.now || Date.now();
    if (!id || !profile) return { ok: false, reason: 'noCode' };
    const gate = importGate(id, now);
    if (gate) return { ok: false, reason: gate };
    running.add(id);
    try {
        const claim = await claimAttempt(id, deps);
        if (!claim.ok) return claim;
        const found = await fetchUser(claim.link.username, deps);
        if (!found.ok) return found;
        if (!hasCode(found.user.about, claim.link.code)) return { ok: false, reason: 'codeMissing' };
        const list = await fetchCollection(found.user.id, deps);
        if (!list.ok) return list;
        const summary = applyImport(profile, list, { mode: claim.link.mode, favorites: found.user.favorites });
        profile.anilist = {
            id: found.user.id,
            name: found.user.name,
            verifiedAt: new Date(now),
            importedAt: new Date(now),
        };
        if (typeof profile.markModified === 'function') profile.markModified('anilist');
        await profile.save();
        await (deps.Link || AnilistLink).deleteOne({ userId: id });
        lastImport.set(id, now);
        while (lastImport.size > 5000) lastImport.delete(lastImport.keys().next().value);
        return { ok: true, ...summary, username: found.user.name, mode: claim.link.mode };
    } finally {
        running.delete(id);
    }
}

// A linked account can sync again without a new code.
async function resyncLinked(userId, profile, { mode = 'merge', ...deps } = {}) {
    const id = snowflake(userId);
    const now = deps.now || Date.now();
    const linked = profile && profile.anilist && anilistId(profile.anilist.id);
    if (!id || !linked) return { ok: false, reason: 'noCode' };
    const gate = importGate(id, now);
    if (gate) return { ok: false, reason: gate };
    running.add(id);
    try {
        const name = validUsername(profile.anilist.name);
        const found = name ? await fetchUser(name, deps) : { ok: false, reason: 'noUser' };
        // The name can change on AniList; the id must still match the verified one.
        if (!found.ok) return found;
        if (found.user.id !== linked) return { ok: false, reason: 'noUser' };
        const list = await fetchCollection(found.user.id, deps);
        if (!list.ok) return list;
        const summary = applyImport(profile, list, { mode, favorites: found.user.favorites });
        profile.anilist = {
            id: linked,
            name: found.user.name,
            verifiedAt: profile.anilist.verifiedAt,
            importedAt: new Date(now),
        };
        if (typeof profile.markModified === 'function') profile.markModified('anilist');
        await profile.save();
        lastImport.set(id, now);
        return { ok: true, ...summary, username: found.user.name, mode };
    } finally {
        running.delete(id);
    }
}

function resetImportState() {
    running.clear();
    lastImport.clear();
}

module.exports = {
    USERNAME_RE,
    CODE_TTL_MS,
    MAX_VERIFY_ATTEMPTS,
    IMPORT_COOLDOWN_MS,
    STATUS_MAP,
    USER_QUERY,
    LIST_QUERY,
    MESSAGES,
    validUsername,
    makeCode,
    readUser,
    hasCode,
    readEntry,
    readCollection,
    fetchUser,
    fetchCollection,
    applyImport,
    startLink,
    claimAttempt,
    verifyAndImport,
    resyncLinked,
    resetImportState,
};
