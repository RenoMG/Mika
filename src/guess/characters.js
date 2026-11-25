const { withTimeout, createCache } = require('../anime/cache');
const { normalizeTitle, levenshtein } = require('../anime/match');
const getGuessCharacter = require('../Models/GuessCharacter').get;
const { noteWrite } = require('../db/evict');
const { snowflake } = require('../utils/safeId');
const {
    GUESS_CHARACTER_TARGET, GUESS_CHARACTER_TTL_MS, MIN_FUZZY_LENGTH,
} = require('./constants');
const { animeKey } = require('./policy');
const store = require('./store');

// Character rounds: a portrait from AniList, answered with the character's name.
// The pool is the most-favourited characters, saved as text in the cache database.
const local = createCache({ max: GUESS_CHARACTER_TARGET, ttlMs: GUESS_CHARACTER_TTL_MS });
let idList = null;
let idListUntil = 0;
let nextPage = 0;
let job = null;

function resetCharacters() { local.clear(); idList = null; idListUntil = 0; nextPage = 0; job = null; }

function model() {
    try { return getGuessCharacter(); } catch { return null; }
}

function httpsImage(value) {
    return typeof value === 'string' && value.startsWith('https://s4.anilist.co/') && value.length <= 300 ? value : '';
}

function record(raw, now) {
    const id = animeKey(raw?.id || raw?.characterId);
    const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 120) : '';
    const image = httpsImage(raw?.image);
    if (!id || !name || !image) return null;
    return {
        characterId: id,
        name,
        native: typeof raw.native === 'string' ? raw.native.slice(0, 120) : '',
        alternative: (Array.isArray(raw.alternative) ? raw.alternative : [])
            .filter((alias) => typeof alias === 'string' && alias.trim()).slice(0, 8).map((alias) => alias.slice(0, 120)),
        image,
        favourites: Number.isInteger(raw.favourites) ? raw.favourites : 0,
        animeId: animeKey(raw.animeId) || '',
        animeTitle: typeof raw.animeTitle === 'string' ? raw.animeTitle.slice(0, 200) : '',
        url: `https://anilist.co/character/${id}`,
        fetchedAt: new Date(now),
        lastAccessedAt: new Date(now),
    };
}

async function saveCharacters(list, now = Date.now()) {
    const rows = (list || []).map((raw) => record(raw, now)).filter(Boolean);
    for (const row of rows) local.set(row.characterId, row);
    idList = null;
    const Model = model();
    if (Model && rows.length) {
        try {
            await withTimeout(Model.bulkWrite(rows.map((row) => ({
                updateOne: { filter: { characterId: row.characterId }, update: { $set: row }, upsert: true },
            })), { ordered: false }), 2000);
            noteWrite('guessCharacter');
        } catch { /* The local copy still serves rounds. */ }
    }
    return rows;
}

async function listCharacterIds(now = Date.now()) {
    if (idList && idListUntil > now) return idList.slice();
    const Model = model();
    const ids = new Set(local.keys());
    let stale = 0;
    if (Model) {
        try {
            const rows = await withTimeout(Model.find({}, { characterId: 1, fetchedAt: 1 })
                .limit(GUESS_CHARACTER_TARGET * 2).maxTimeMS(500).lean(), 600);
            for (const row of rows) {
                ids.add(String(row.characterId));
                if (now - new Date(row.fetchedAt).getTime() >= GUESS_CHARACTER_TTL_MS) stale += 1;
            }
        } catch { /* Fall back to the local copy. */ }
    }
    idList = [...ids];
    idList.stale = stale;
    idListUntil = now + 60000;
    return idList.slice();
}

async function loadCharacter(id) {
    const key = animeKey(id);
    if (!key) return null;
    const hit = local.get(key);
    if (hit) return hit;
    const Model = model();
    if (!Model) return null;
    try {
        const doc = await withTimeout(Model.findOne({ characterId: key }).maxTimeMS(300).lean(), 400);
        if (!doc) return null;
        if (Date.now() - new Date(doc.lastAccessedAt || 0).getTime() >= 60000) {
            Promise.resolve(Model.updateOne({ _id: doc._id }, { $set: { lastAccessedAt: new Date() } })).catch(() => {});
        }
        local.set(key, doc);
        return doc;
    } catch { return null; }
}

// Grow the pool one AniList page at a time (50 characters). Once full, keep
// cycling pages so year-old entries are refreshed.
function replenishCharacters(deps = {}) {
    if (job) return job;
    job = (async () => {
        const ids = await listCharacterIds();
        const full = ids.length >= GUESS_CHARACTER_TARGET;
        if (full && !idList?.stale && !deps.force) return { ok: true, idle: true };
        if (!nextPage) nextPage = full ? 1 : Math.floor(ids.length / 45) + 1;
        const fetchPage = deps.getGuessCharacters || require('../anime/client').getGuessCharacters;
        const result = await fetchPage(nextPage);
        if (!result?.ok) return { ok: false, unavailable: true };
        await saveCharacters(result.characters, (deps.now || Date.now)());
        nextPage = result.hasNext && nextPage < Math.ceil(GUESS_CHARACTER_TARGET / 40) ? nextPage + 1 : 1;
        return { ok: true, added: result.characters.length };
    })().catch(() => ({ ok: false, unavailable: true })).finally(() => { job = null; });
    return job;
}

async function pickCharacter(guildId, random, deps) {
    const ids = await listCharacterIds((deps.now || Date.now)());
    if (!ids.length) return null;
    const recent = new Set(await (deps.loadRecent || store.loadRecentCharacters)(guildId).catch(() => []));
    let open = ids.filter((id) => !recent.has(id));
    if (!open.length) open = ids;
    for (let attempt = 0; attempt < 5 && open.length; attempt++) {
        const index = Math.min(open.length - 1, Math.floor(Math.max(0, Number(random()) || 0) * open.length));
        const doc = await loadCharacter(open[index]);
        if (doc && httpsImage(doc.image)) {
            await (deps.remember || store.rememberCharacter)(guildId, doc.characterId).catch(() => {});
            return doc;
        }
        open.splice(index, 1);
    }
    return null;
}

// Same result shape as chooseRound, so startRound can use either.
async function chooseCharacter(guildId, deps = {}) {
    const guildKey = snowflake(guildId);
    if (!guildKey) return { ok: false, empty: true };
    const random = typeof deps.random === 'function' ? deps.random : Math.random;
    let doc = await pickCharacter(guildKey, random, deps);
    const ids = await listCharacterIds();
    if (doc) {
        if (ids.length < GUESS_CHARACTER_TARGET || ids.stale) void replenishCharacters(deps);
        return { ok: true, source: 'cache', ...characterRound(doc) };
    }
    const created = await withTimeout(replenishCharacters(deps), 4000).catch(() => null);
    doc = await pickCharacter(guildKey, random, deps);
    if (doc) return { ok: true, source: 'fresh', ...characterRound(doc) };
    return { ok: false, empty: true, unavailable: Boolean(created?.unavailable), variety: !created?.unavailable };
}

function characterRound(doc) {
    const character = {
        id: String(doc.characterId),
        name: doc.name,
        native: doc.native || '',
        alternative: doc.alternative || [],
        image: doc.image,
        animeTitle: doc.animeTitle || '',
        url: doc.url || `https://anilist.co/character/${doc.characterId}`,
    };
    return { kind: 'character', character, url: doc.image, media: null, screenshots: [] };
}

function fuzzy(left, right) {
    if (left.length < MIN_FUZZY_LENGTH || right.length < MIN_FUZZY_LENGTH) return false;
    if (Math.abs(left.length - right.length) > 2) return false;
    return levenshtein(left, right) <= (left.length < 8 ? 1 : 2);
}

// A character answer: the full name in either order, the native name, a listed
// alias, or one part of the name (given or family) of three letters or more.
function createCharacterJudge(character) {
    const full = normalizeTitle(character?.name);
    const words = full.split(' ').filter(Boolean);
    const exact = new Set([full, words.slice().reverse().join(' '), normalizeTitle(character?.native),
        ...(character?.alternative || []).map(normalizeTitle)].filter(Boolean));
    const parts = new Set(words.filter((word) => word.length >= 3));
    const anime = normalizeTitle(character?.animeTitle);
    return function judge(guess) {
        const left = normalizeTitle(guess);
        if (!left || left.length > 120) return { kind: 'wrong' };
        if (exact.has(left) || parts.has(left)) return { kind: 'correct' };
        if ([...exact].some((name) => fuzzy(left, name)) || [...parts].some((part) => fuzzy(left, part))) {
            return { kind: 'correct' };
        }
        if (anime && (left === anime || fuzzy(left, anime))) return { kind: 'close', hint: 'character' };
        if (left.split(' ').some((word) => word.length >= 3 && parts.has(word))) return { kind: 'close', hint: 'name' };
        return { kind: 'wrong' };
    };
}

module.exports = {
    resetCharacters,
    saveCharacters,
    listCharacterIds,
    loadCharacter,
    replenishCharacters,
    chooseCharacter,
    characterRound,
    createCharacterJudge,
};
