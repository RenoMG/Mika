const { readJson, withSignal } = require('../utils/http');
const { redact } = require('../utils/redact');
const {
    CACHE_OP_MS,
    DETAIL_TTL_MS,
    SEARCH_TTL_MS,
    createMongoCache,
    createCache,
    readGuessDetail,
} = require('./cache');
const { normalizeTitle } = require('./match');
const { anilistId, mediaId } = require('./ids');

const ANILIST_URL = 'https://graphql.anilist.co';
const KITSU_ORIGIN = 'https://kitsu.app/api/edge/anime';
const MIN_INTERVAL_MS = 2500;
const MAX_PER_WINDOW = 24;
const WINDOW_MS = 60 * 1000;

const MEDIA_FIELDS = `
  id
  idMal
  format
  isAdult
  siteUrl
  description
  episodes
  duration
  status
  averageScore
  genres
  synonyms
  title { romaji english native }
  tags { name rank isGeneralSpoiler isMediaSpoiler isAdult }
  studios { nodes { name isAnimationStudio } }
  startDate { year month day }
  endDate { year month day }
  coverImage { large }
`;

const SEARCH_QUERY = `query ($search: String) {
  Page(page: 1, perPage: 10) {
    media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
      ${MEDIA_FIELDS}
    }
  }
}`;

const MEDIA_QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME, isAdult: false) {
    ${MEDIA_FIELDS}
  }
}`;

const GUESS_CONTEXT_QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME, isAdult: false) {
    format
    relations { edges { relationType node { id type isAdult title { romaji english native } } } }
  }
}`;


const RANDOM_MIN_SCORE = 70;
const RANDOM_MIN_POPULARITY = 10000;
const RANDOM_PER_PAGE = 25;
const RANDOM_MAX_PAGE = 10;

const RANDOM_QUERY = `query ($page: Int, $genres: [String], $tags: [String]) {
  Page(page: $page, perPage: ${RANDOM_PER_PAGE}) {
    pageInfo { lastPage }
    media(
      type: ANIME
      isAdult: false
      genre_in: $genres
      tag_in: $tags
      sort: [POPULARITY_DESC]
      averageScore_greater: ${RANDOM_MIN_SCORE - 1}
      popularity_greater: ${RANDOM_MIN_POPULARITY - 1}
    ) {
      ${MEDIA_FIELDS}
      popularity
    }
  }
}`;

// Separate from /randomanime: rotate broad, genre and era pools, with up to
// 1,000 qualifying entries per scope instead of the first 250 globally.
const GUESS_CANDIDATE_QUERY = `query ($page: Int, $genres: [String], $after: FuzzyDateInt, $before: FuzzyDateInt) {
  Page(page: $page, perPage: 25) {
    pageInfo { lastPage }
    media(type: ANIME, isAdult: false, status_not: NOT_YET_RELEASED,
      sort: [POPULARITY_DESC], averageScore_greater: 69, popularity_greater: 9999,
      genre_in: $genres, startDate_greater: $after, startDate_lesser: $before) {
      ${MEDIA_FIELDS}
      popularity
      relations { edges { relationType node { id type isAdult title { romaji english native } } } }
    }
  }
}`;

function guessContext(media) {
    const related = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SUMMARY', 'ALTERNATIVE', 'SPIN_OFF']);
    const edges = (Array.isArray(media.relations?.edges) ? media.relations.edges : [])
        .filter((edge) => related.has(edge?.relationType) && edge.node?.type === 'ANIME' && edge.node.isAdult !== true);
    return {
        format: String(media.format || ''),
        relatedIds: [...new Set(edges.map((edge) => anilistId(edge.node.id)).filter(Boolean))].slice(0, 100),
        relatedTitles: edges.slice(0, 12).flatMap((edge) => Object.values(edge.node.title || {}))
            .filter((title) => typeof title === 'string' && title.trim()).slice(0, 24).map((title) => title.slice(0, 160)),
        guessContextVersion: 2,
    };
}

// Favorite characters, staff, and studios. Adult characters are filtered by
// AniList itself through isAdult on the media they appear in, so only names
// and ids are read, never descriptions or images.
const ENTITY_QUERIES = Object.freeze({
    character: `query ($search: String) {
  Page(page: 1, perPage: 10) { characters(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) { id name { full native } } }
}`,
    staff: `query ($search: String) {
  Page(page: 1, perPage: 10) { staff(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) { id name { full native } } }
}`,
    studio: `query ($search: String) {
  Page(page: 1, perPage: 10) { studios(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) { id name isAnimationStudio } }
}`,
});
// Detail cards for /search type:Character and type:Studio. Only titles from
// non-adult anime are kept.
const DETAIL_QUERIES = Object.freeze({
    character: `query ($id: Int) {
  Character(id: $id) {
    id name { full native alternative } image { large } description(asHtml: false) gender age favourites siteUrl
    media(sort: POPULARITY_DESC, perPage: 8, type: ANIME) { nodes { id isAdult title { english romaji } } }
  }
}`,
    studio: `query ($id: Int) {
  Studio(id: $id) {
    id name isAnimationStudio favourites siteUrl
    media(sort: POPULARITY_DESC, perPage: 10, isMain: true) { nodes { id isAdult type title { english romaji } startDate { year } } }
  }
}`,
});

function detailFrom(body, kind) {
    const node = body && body.data ? body.data[kind === 'character' ? 'Character' : 'Studio'] : null;
    const id = anilistId(node && node.id);
    if (!id) return null;
    const media = (node.media && Array.isArray(node.media.nodes) ? node.media.nodes : [])
        .filter((item) => item && item.isAdult !== true && (kind !== 'studio' || item.type === 'ANIME'))
        .map((item) => ({
            id: anilistId(item.id),
            title: String((item.title && (item.title.english || item.title.romaji)) || '').slice(0, 200),
            year: item.startDate && Number.isInteger(item.startDate.year) ? item.startDate.year : null,
        }))
        .filter((item) => item.id && item.title);
    if (kind === 'character') {
        const name = node.name && typeof node.name === 'object' ? node.name : {};
        return {
            kind,
            id,
            name: String(name.full || name.native || '').slice(0, 100),
            native: typeof name.native === 'string' ? name.native.slice(0, 100) : '',
            alternative: Array.isArray(name.alternative) ? name.alternative.filter((item) => typeof item === 'string').slice(0, 5) : [],
            image: httpUrl(node.image && node.image.large),
            description: typeof node.description === 'string' ? node.description.slice(0, 6000) : '',
            gender: typeof node.gender === 'string' ? node.gender.slice(0, 40) : '',
            age: typeof node.age === 'string' ? node.age.slice(0, 40) : '',
            favourites: Number.isInteger(node.favourites) ? node.favourites : null,
            url: httpUrl(node.siteUrl) || `https://anilist.co/character/${id}`,
            media,
        };
    }
    return {
        kind,
        id,
        name: String(node.name || '').slice(0, 100),
        animation: node.isAnimationStudio === true,
        favourites: Number.isInteger(node.favourites) ? node.favourites : null,
        url: httpUrl(node.siteUrl) || `https://anilist.co/studio/${id}`,
        media,
    };
}

const ENTITY_KEYS = Object.freeze({ character: 'characters', staff: 'staff', studio: 'studios' });

function entityName(node, kind) {
    if (!node || typeof node !== 'object') return '';
    if (kind === 'studio') return typeof node.name === 'string' ? node.name : '';
    const name = node.name && typeof node.name === 'object' ? node.name : {};
    if (typeof name.full === 'string' && name.full.trim()) return name.full;
    return typeof name.native === 'string' ? name.native : '';
}

function entitiesFrom(body, kind) {
    const rows = body && body.data && body.data.Page ? body.data.Page[ENTITY_KEYS[kind]] : null;
    if (!Array.isArray(rows)) return null;
    const list = [];
    for (const node of rows) {
        const id = anilistId(node && node.id);
        const name = entityName(node, kind).trim().slice(0, 100);
        if (!id || !name || list.some((item) => item.id === id)) continue;
        list.push({ id, name });
    }
    return list;
}

const CATALOG_QUERY = `query {
  GenreCollection
  MediaTagCollection {
    name
    category
    isAdult
    isGeneralSpoiler
    isMediaSpoiler
  }
}`;

// AniList has no "Time Skip" tag. Time Loop is the tag people mean by that.
// The list is the popular non-adult set offered in the picker, in menu order.
const CURATED_TAGS = [
    'Isekai',
    'Iyashikei',
    'Super Power',
    'Time Loop',
    'Reverse Isekai',
    'Cute Girls Doing Cute Things',
    'Found Family',
    'Magic',
    'Cultivation',
    'Urban Fantasy',
    'Cyberpunk',
    'Post-Apocalyptic',
    'Virtual World',
    'Superhero',
    'School',
    'Idol',
    'Coming of Age',
    'Love Triangle',
    'Swordplay',
    'Villainess',
    'Video Games',
    'Shounen',
    'Shoujo',
    'Seinen',
    'Josei',
];

function usableTag(tag) {
    if (!tag || typeof tag.name !== 'string') return false;
    const name = tag.name.trim();
    if (!name || name.length > 100) return false;
    if (tag.isAdult === true || tag.isGeneralSpoiler === true || tag.isMediaSpoiler === true) return false;
    const category = typeof tag.category === 'string' ? tag.category : '';
    if (category === 'Technical' || category.startsWith('Sexual Content')) return false;
    return true;
}

function curateTags(collection) {
    const available = new Set();
    for (const tag of collection || []) {
        if (!usableTag(tag)) continue;
        available.add(tag.name.trim());
    }
    return CURATED_TAGS.filter((name) => available.has(name));
}

function uniqueNames(list) {
    const next = [];
    const seen = new Set();
    for (const name of list || []) {
        if (typeof name !== 'string') continue;
        const text = name.trim();
        if (!text || text.length > 100) continue;
        const key = text.toLowerCase();
        if (seen.has(key) || key === 'hentai') continue;
        seen.add(key);
        next.push(text);
        if (next.length >= 10) break;
    }
    return next;
}

function buildRandomQuery({ page = 1, genres = [], tags = [] } = {}) {
    const cleanGenres = uniqueNames(genres);
    const cleanTags = uniqueNames(tags);
    const safePage = Math.max(1, Math.min(500, Number(page) || 1));
    return {
        query: RANDOM_QUERY,
        variables: {
            page: safePage,
            genres: cleanGenres.length ? cleanGenres : null,
            tags: cleanTags.length ? cleanTags : null,
        },
    };
}

function pickRandomPage(maxPage, random = Math.random) {
    const max = Math.max(1, Math.min(RANDOM_MAX_PAGE, Number(maxPage) || 1));
    const roll = Math.min(0.999999, Math.max(0, Number(random()) || 0));
    return 1 + Math.floor(roll * max);
}

function pickItem(list, random = Math.random) {
    if (!Array.isArray(list) || !list.length) return null;
    const roll = Math.min(0.999999, Math.max(0, Number(random()) || 0));
    return list[Math.floor(roll * list.length)];
}

function passesRandomFilter(media) {
    if (!media || media.isAdult === true) return false;
    if (!Number.isInteger(media.averageScore) || media.averageScore < RANDOM_MIN_SCORE) return false;
    if (!Number.isInteger(media.popularity) || media.popularity < RANDOM_MIN_POPULARITY) return false;
    return true;
}

function filterRandomPool(list) {
    return (list || []).filter(passesRandomFilter).map(fromAnilist).filter(Boolean);
}

function categorySlug(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function kitsuRandomUrl({ page = 1, genre = '' } = {}) {
    const offset = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * 20);
    const url = new URL(KITSU_ORIGIN);
    url.searchParams.set('filter[nsfw]', 'false');
    url.searchParams.set('page[limit]', '20');
    url.searchParams.set('page[offset]', String(Math.min(offset, 2000)));
    url.searchParams.set('sort', '-userCount');
    const slug = categorySlug(genre);
    if (slug) url.searchParams.set('filter[categories]', slug);
    return url;
}

function genreNamesFrom(collection) {
    if (!Array.isArray(collection)) return [];
    const names = collection
        .filter((name) => typeof name === 'string' && name.trim())
        .map((name) => name.trim())
        .filter((name) => name.toLowerCase() !== 'hentai');
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

function delayMs({ now, stamps, pauseUntil, minIntervalMs, maxPerWindow, windowMs }) {
    const recent = [];
    for (const stamp of stamps) {
        if (now - stamp < windowMs) recent.push(stamp);
    }
    let wait = 0;
    if (pauseUntil > now) wait = Math.max(wait, pauseUntil - now);
    if (recent.length >= maxPerWindow) wait = Math.max(wait, windowMs - (now - recent[0]) + 1);
    if (recent.length) wait = Math.max(wait, minIntervalMs - (now - recent[recent.length - 1]));
    return wait;
}

function abortError() {
    const error = new Error('The request was aborted');
    error.name = 'AbortError';
    return error;
}

function isAbort(error) {
    if (!error || typeof error !== 'object') return false;
    return error.name === 'AbortError' || error.code === 20 || error.code === 'ABORT_ERR';
}

// Timing lines stay off unless this flag or LOG_LEVEL=debug is set. The line
// itself is built in autocomplete.js and never includes the query text.
function autocompleteTimingEnabled() {
    const flag = String(process.env.MIKA_AUTOCOMPLETE_TIMING || '').trim().toLowerCase();
    if (flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on') return true;
    const level = String(process.env.LOG_LEVEL || '').trim().toLowerCase();
    return level === 'debug' || level === 'trace';
}

function headerValue(response, name) {
    if (!response || !response.headers || typeof response.headers.get !== 'function') return null;
    const value = response.headers.get(name);
    if (value == null || value === '') return null;
    return String(value).slice(0, 40);
}

function controlSignal(parent, timeoutMs) {
    const controller = new AbortController();
    let timer = null;
    if (Number.isFinite(timeoutMs) && timeoutMs >= 0) {
        timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
        if (typeof timer.unref === 'function') timer.unref();
    }
    const onParent = () => controller.abort();
    if (parent && typeof parent.addEventListener === 'function') {
        if (parent.aborted) controller.abort();
        else parent.addEventListener('abort', onParent, { once: true });
    }
    return {
        signal: controller.signal,
        cancel() {
            if (timer) clearTimeout(timer);
            if (parent && typeof parent.removeEventListener === 'function') {
                parent.removeEventListener('abort', onParent);
            }
        },
    };
}

function createLimiter({
    maxPerWindow = MAX_PER_WINDOW,
    windowMs = WINDOW_MS,
    minIntervalMs = MIN_INTERVAL_MS,
    now = Date.now,
    sleep,
} = {}) {
    const stamps = [];
    let pauseUntil = 0;
    let queued = 0;
    let tail = Promise.resolve();

    function waitMs() {
        const time = now();
        while (stamps.length && stamps[0] <= time - windowMs) stamps.shift();
        return delayMs({ now: time, stamps, pauseUntil, minIntervalMs, maxPerWindow, windowMs });
    }
    function noteRetryAfter(ms) {
        pauseUntil = Math.max(pauseUntil, now() + Math.min(Math.max(0, Number(ms) || 0), 120000));
    }
    function schedule(run, { signal } = {}) {
        if (queued >= 32 || signal?.aborted) return Promise.reject(abortError());
        queued += 1;
        const job = tail.then(async () => {
            let wait = waitMs();
            while (wait > 0) {
                if (signal?.aborted) throw abortError();
                if (sleep) await withSignal(sleep(wait), signal);
                else await new Promise((resolve, reject) => {
                    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
                    const abort = () => { cleanup(); reject(abortError()); };
                    const timer = setTimeout(() => { cleanup(); resolve(); }, wait);
                    signal?.addEventListener('abort', abort, { once: true });
                });
                wait = waitMs();
            }
            if (signal?.aborted) throw abortError();
            // Once dispatched it counts, even if the caller cancels later.
            stamps.push(now());
            return withSignal(Promise.resolve().then(run), signal);
        }).finally(() => { queued -= 1; });
        tail = job.catch(() => {});
        return withSignal(job, signal);
    }

    return { waitMs, noteRetryAfter, schedule };
}

function httpUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
}

function plainSynopsis(value) {
    let text = String(value || '');
    text = text.replace(/~![\s\S]*?!~/g, '');
    text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '');
    text = text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
    text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 1200) text = `${text.slice(0, 1199).trimEnd()}…`;
    return text;
}

function dateFrom(value) {
    if (!value || typeof value !== 'object' || !value.year) return null;
    return {
        year: Number(value.year) || null,
        month: Number(value.month) || null,
        day: Number(value.day) || null,
    };
}

function tagsFrom(tags) {
    if (!Array.isArray(tags)) return [];
    return tags
        .filter((tag) => tag && typeof tag.name === 'string' && !tag.isGeneralSpoiler && !tag.isMediaSpoiler && tag.isAdult !== true)
        .sort((a, b) => (b.rank || 0) - (a.rank || 0))
        .slice(0, 5)
        .map((tag) => tag.name);
}

function studiosFrom(studios) {
    const nodes = studios && Array.isArray(studios.nodes) ? studios.nodes : [];
    const animation = nodes.filter((node) => node && node.isAnimationStudio && node.name);
    const chosen = animation.length ? animation : nodes.filter((node) => node && node.name);
    return chosen.slice(0, 4).map((node) => String(node.name));
}

function fromAnilist(media) {
    if (!media || typeof media !== 'object' || media.isAdult === true || !media.id) return null;
    const titles = media.title || {};
    return {
        id: String(media.id),
        idMal: Number.isInteger(media.idMal) && media.idMal > 0 ? media.idMal : null,
        source: 'AniList',
        format: typeof media.format === 'string' ? media.format : '',
        url: httpUrl(media.siteUrl) || `https://anilist.co/anime/${media.id}`,
        cover: httpUrl(media.coverImage && media.coverImage.large),
        titles: {
            romaji: typeof titles.romaji === 'string' ? titles.romaji : '',
            english: typeof titles.english === 'string' ? titles.english : '',
            native: typeof titles.native === 'string' ? titles.native : '',
        },
        synonyms: Array.isArray(media.synonyms) ? media.synonyms.filter((name) => typeof name === 'string').slice(0, 12) : [],
        synopsis: plainSynopsis(media.description),
        episodes: Number.isInteger(media.episodes) ? media.episodes : null,
        duration: Number.isInteger(media.duration) && media.duration > 0 ? media.duration : null,
        status: typeof media.status === 'string' ? media.status : '',
        score: Number.isInteger(media.averageScore) ? media.averageScore : null,
        genres: Array.isArray(media.genres) ? media.genres.filter((name) => typeof name === 'string').slice(0, 12) : [],
        tags: tagsFrom(media.tags),
        studios: studiosFrom(media.studios),
        startDate: dateFrom(media.startDate),
        endDate: dateFrom(media.endDate),
    };
}

function dateFromIso(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function kitsuSafe(attributes) {
    if (!attributes || attributes.nsfw === true) return false;
    const rating = String(attributes.ageRating || '').toUpperCase();
    return rating !== 'R18' && rating !== 'R18+';
}

function kitsuDecent(attributes) {
    if (!kitsuSafe(attributes)) return false;
    const score = Number(attributes.averageRating);
    if (!Number.isFinite(score) || score < RANDOM_MIN_SCORE) return false;
    const users = Number(attributes.userCount);
    if (Number.isFinite(users) && users < 2000) return false;
    return true;
}

function kitsuGenres(item, included) {
    const refs = item && item.relationships && item.relationships.categories && item.relationships.categories.data;
    if (!Array.isArray(refs)) return [];
    const byId = new Map();
    for (const row of included || []) {
        if (row && row.type === 'categories' && row.id != null) byId.set(String(row.id), row);
    }
    const names = [];
    for (const ref of refs) {
        const row = byId.get(String(ref && ref.id));
        const attributes = row && row.attributes;
        if (!attributes || attributes.nsfw === true) continue;
        const title = attributes.title || attributes.name;
        if (typeof title === 'string' && title) names.push(title);
    }
    return names.slice(0, 12);
}

function fromKitsu(item, included) {
    if (!item || item.id == null) return null;
    const attributes = item.attributes || {};
    if (!kitsuSafe(attributes)) return null;
    const titles = attributes.titles || {};
    const poster = attributes.posterImage || {};
    const score = Number(attributes.averageRating);
    return {
        id: `kitsu:${item.id}`,
        idMal: null,
        source: 'Kitsu',
        url: `https://kitsu.app/anime/${attributes.slug || item.id}`,
        cover: httpUrl(poster.large || poster.medium || poster.original),
        titles: {
            romaji: typeof titles.en_jp === 'string' ? titles.en_jp : '',
            english: typeof titles.en === 'string' ? titles.en : (typeof attributes.canonicalTitle === 'string' ? attributes.canonicalTitle : ''),
            native: typeof titles.ja_jp === 'string' ? titles.ja_jp : '',
        },
        synonyms: Array.isArray(attributes.abbreviatedTitles) ? attributes.abbreviatedTitles.filter((name) => typeof name === 'string').slice(0, 12) : [],
        synopsis: plainSynopsis(attributes.synopsis),
        episodes: Number.isInteger(attributes.episodeCount) ? attributes.episodeCount : null,
        status: typeof attributes.status === 'string' ? attributes.status : '',
        score: Number.isFinite(score) ? Math.round(score) : null,
        genres: kitsuGenres(item, included),
        tags: [],
        studios: [],
        startDate: dateFromIso(attributes.startDate),
        endDate: dateFromIso(attributes.endDate),
    };
}

function parseKitsuList(body) {
    const rows = body && Array.isArray(body.data) ? body.data : [];
    const included = body && Array.isArray(body.included) ? body.included : [];
    return rows.map((item) => fromKitsu(item, included)).filter(Boolean).slice(0, 10);
}

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            const error = new Error('Anime cache timed out');
            error.code = 'CACHE_TIMEOUT';
            reject(error);
        }, ms);
        if (typeof timer.unref === 'function') timer.unref();
        // Both resolution and rejection are handled below.
        // eslint-disable-next-line promise/catch-or-return
        Promise.resolve(promise).then(
            (value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

async function readCache(cache, key, trace) {
    if (!cache || typeof cache.get !== 'function') return undefined;
    const started = Date.now();
    try {
        const value = await withTimeout(cache.get(key), CACHE_OP_MS);
        if (trace) {
            trace.cacheMs = Date.now() - started;
            trace.cachePhase = value == null ? 'miss' : 'hit';
        }
        return value;
    } catch (error) {
        if (trace) {
            trace.cacheMs = Date.now() - started;
            trace.cachePhase = error && error.code === 'CACHE_TIMEOUT' ? 'timeout' : 'error';
        }
        return undefined;
    }
}

async function writeCache(cache, key, value) {
    if (!cache || typeof cache.set !== 'function') return;
    try {
        await withTimeout(cache.set(key, value), CACHE_OP_MS);
    } catch (error) {
        // A slow or failed cache must not fail the command. Debug only, and
        // only when autocomplete timing is enabled, so a 200ms miss stays quiet.
        if (autocompleteTimingEnabled()) console.debug(redact(error));
    }
}

function retryAfterMs(response, now) {
    const raw = response && response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('retry-after')
        : null;
    if (raw == null || raw === '') return 60000;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.min(Math.max(0, seconds) * 1000, 120000);
    const when = Date.parse(String(raw));
    if (Number.isFinite(when)) return Math.min(Math.max(0, when - now), 120000);
    return 60000;
}

function createClient({
    fetch: fetchImpl = global.fetch,
    now = Date.now,
    sleep,
    limiter,
    kitsuLimiter,
    detailCache,
    searchCache,
    genreCache,
} = {}) {
    const limit = limiter || createLimiter({ now, sleep });
    // Local public metadata remains useful even without the optional Mongo cache.
    const details = detailCache || createMongoCache({ kind: 'detail', ttlMs: DETAIL_TTL_MS, now });
    const searches = searchCache || createMongoCache({ kind: 'search', ttlMs: SEARCH_TTL_MS, now });
    const genres = genreCache || createMongoCache({ kind: 'genre', ttlMs: DETAIL_TTL_MS, now });
    const inflight = new Map();
    let catalogJob = null;
    let catalog = null;
    let catalogExpires = 0;
    const detailJobs = new Map();
    const randomJobs = new Map();
    const contextJobs = new Map();
    const contexts = createCache({ max: 300, ttlMs: DETAIL_TTL_MS, now });
    const negative = createCache({ max: 200, ttlMs: 30000, now });
    const kitsuLimit = kitsuLimiter || createLimiter({ now, sleep, minIntervalMs: 500, maxPerWindow: 60 });

    function remember(list) {
        // Cache persistence is a side effect, never part of response latency.
        for (const media of list) {
            if (media?.id) void writeCache(details, media.id, media);
        }
        return list;
    }

    // Legacy ID lists remain readable until they expire. New entries carry snapshots.
    async function materializeList(value) {
        if (value == null) return null;
        if (!Array.isArray(value)) return null;
        if (!value.length) return [];
        if (typeof value[0] === 'string') {
            if (!value.every((item) => typeof item === 'string' && item)) return null;
            const rows = await Promise.all(value.map((id) => readCache(details, id)));
            if (rows.some((media) => !media || typeof media !== 'object')) return null;
            return rows;
        }
        if (value.every((item) => item && typeof item === 'object')) return value;
        return null;
    }

    async function callAnilist(query, variables, requestOptions = {}) {
        const { trace, signal } = requestOptions;
        const timeoutMs = Number.isFinite(requestOptions.timeoutMs) ? requestOptions.timeoutMs : 8000;
        if (signal?.aborted || timeoutMs <= 0 || limit.waitMs() >= timeoutMs) return null;
        const linked = controlSignal(signal, timeoutMs);
        try {
            const response = await limit.schedule(() => fetchImpl(ANILIST_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mika Discord Bot' },
                body: JSON.stringify({ query, variables }), signal: linked.signal,
            }), { signal: linked.signal });
            if (!response) return null;
            if (trace) {
                trace.anilistStatus = response.status;
                trace.rateLimitRemaining = headerValue(response, 'x-ratelimit-remaining');
                trace.retryAfter = headerValue(response, 'retry-after');
            }
            if (response.status === 429) limit.noteRetryAfter(retryAfterMs(response, now()));
            else if (headerValue(response, 'x-ratelimit-remaining') === '0') {
                const reset = Number(headerValue(response, 'x-ratelimit-reset')) * 1000;
                limit.noteRetryAfter(Number.isFinite(reset) && reset > now() ? reset - now() : WINDOW_MS);
            }
            if (response.status === 404 && requestOptions.notFound === true) {
                await response.body?.cancel?.();
                return { notFound: true };
            }
            if (response.status !== 200) {
                await response.body?.cancel?.();
                return null;
            }
            return await readJson(response, linked.signal);
        } catch (error) {
            if (!isAbort(error)) console.error(redact(error));
            return null;
        } finally { linked.cancel(); }
    }

    async function kitsuFetch(url, requestOptions = {}) {
        const trace = requestOptions.trace;
        const timeoutMs = Number.isFinite(requestOptions.timeoutMs) ? requestOptions.timeoutMs : 8000;
        const started = Date.now();
        const linked = controlSignal(requestOptions.signal, timeoutMs);
        try {
            const response = await kitsuLimit.schedule(() => fetchImpl(url, {
                headers: {
                    Accept: 'application/vnd.api+json',
                    'User-Agent': 'Mika Discord Bot',
                },
                signal: linked.signal,
            }), { signal: linked.signal });
            if (trace) {
                trace.kitsuMs = Date.now() - started;
                trace.kitsuStatus = response ? response.status : 0;
            }
            if (response?.status === 429) kitsuLimit.noteRetryAfter(retryAfterMs(response, now()));
            if (!response || response.status !== 200) {
                await response?.body?.cancel?.();
                return null;
            }
            return await readJson(response, linked.signal);
        } catch (error) {
            if (trace) {
                trace.kitsuMs = Date.now() - started;
                trace.kitsuStatus = 0;
            }
            if (!isAbort(error)) console.error(redact(error));
            return null;
        } finally {
            linked.cancel();
        }
    }

    function listHasAnilist(list) {
        return (list || []).some((media) => anilistId(media && media.id));
    }

    function persistSearch(list, key) {
        remember(list);
        if (!list.length) { negative.set(key, true); return Promise.resolve(); }
        // Store the bounded result objects, avoiding an N+1 detail read on hits.
        return writeCache(searches, key, list);
    }

    async function searchAnilist(text, requestOptions = {}) {
        const trace = requestOptions.trace;
        const started = Date.now();
        const cap = requestOptions.autocomplete === true
            ? Math.min(1000, Math.max(0, Number.isFinite(requestOptions.budgetMs) ? requestOptions.budgetMs : 1000))
            : 8000;
        const body = await callAnilist(SEARCH_QUERY, { search: text }, {
            signal: requestOptions.signal,
            timeoutMs: cap,
            trace,
        });
        if (trace) trace.anilistMs = Date.now() - started;
        if (!Array.isArray(body?.data?.Page?.media)) return null;
        const media = body.data.Page.media;
        return media.map(fromAnilist).filter(Boolean).slice(0, 10);
    }

    async function searchKitsu(text, requestOptions = {}) {
        const trace = requestOptions.trace;
        const started = Date.now();
        const url = new URL(KITSU_ORIGIN);
        url.searchParams.set('filter[text]', text.slice(0, 100));
        url.searchParams.set('filter[nsfw]', 'false');
        url.searchParams.set('page[limit]', '10');
        url.searchParams.set('include', 'categories');
        const timeoutMs = Number.isFinite(requestOptions.timeoutMs) ? requestOptions.timeoutMs : 8000;
        const body = await kitsuFetch(url.toString(), {
            signal: requestOptions.signal,
            timeoutMs,
            trace,
        });
        if (trace && trace.kitsuMs == null) trace.kitsuMs = Date.now() - started;
        if (!body) return null;
        return parseKitsuList(body);
    }

    function startSearch(query, key, options = {}) {
        if (options.signal?.aborted) return Promise.resolve([]);
        let entry = inflight.get(key);
        if (!entry || entry.controller.signal.aborted) {
            if (inflight.size >= 128) return Promise.resolve([]);
            entry = { controller: new AbortController(), refs: 0, promise: null };
            const current = entry;
            current.promise = (async () => {
                const providerOptions = { signal: current.controller.signal, trace: options.trace };
                let list = await searchAnilist(query, providerOptions);
                if (!list && !options.anilistOnly && !current.controller.signal.aborted) list = await searchKitsu(query, providerOptions);
                if (!Array.isArray(list)) return [];
                void persistSearch(list, key);
                return list;
            })().catch((error) => {
                if (!isAbort(error)) console.error(redact(error));
                return [];
            }).finally(() => { if (inflight.get(key) === current) inflight.delete(key); });
            inflight.set(key, current);
        } else if (options.trace) options.trace.deduped = true;
        // Each caller owns its deadline; a short autocomplete cannot cancel a
        // submitted command that is waiting for the same query.
        entry.refs += 1;
        const linked = controlSignal(options.signal, Number.isFinite(options.budgetMs) ? options.budgetMs : 16000);
        return withSignal(entry.promise, linked.signal).catch((error) => {
            if (!isAbort(error)) throw error;
            return [];
        }).finally(() => {
            linked.cancel();
            entry.refs -= 1;
            if (!entry.refs) entry.controller.abort();
        });
    }

    async function peekSearch(text, requestOptions = {}) {
        const query = typeof text === 'string' ? text.trim() : '';
        const key = `${requestOptions.anilistOnly ? 'anilist:' : ''}${normalizeTitle(query)}`;
        const trace = requestOptions && requestOptions.trace;
        if (!normalizeTitle(query)) {
            if (trace) {
                trace.cacheMs = 0;
                trace.cachePhase = 'miss';
            }
            return null;
        }
        if (negative.get(key)) return [];
        const hit = await readCache(searches, key, trace);
        if (hit == null) return null;
        const list = await materializeList(hit);
        if (!list || (requestOptions.anilistOnly && list.length && !listHasAnilist(list))) {
            if (trace && trace.cachePhase === 'hit') trace.cachePhase = 'miss';
            return null;
        }
        return list;
    }

    async function search(text, options = {}) {
        const query = typeof text === 'string' ? text.trim() : '';
        const key = `${options.anilistOnly ? 'anilist:' : ''}${normalizeTitle(query)}`;
        const trace = options && options.trace;
        if (!normalizeTitle(query)) return [];
        if (negative.get(key)) return [];
        if (options.signal && options.signal.aborted) {
            if (trace) trace.superseded = true;
            return [];
        }
        const cached = options.cacheChecked ? null : await readCache(searches, key, trace);
        const hydrated = await materializeList(cached);
        if (hydrated && hydrated.length && (!options.anilistOnly || listHasAnilist(hydrated))) {
            return hydrated.map((media) => ({ ...media, cached: true }));
        }
        if (trace && trace.cachePhase === 'hit') trace.cachePhase = 'miss';
        if (options.signal && options.signal.aborted) {
            if (trace) trace.superseded = true;
            return [];
        }
        const maxWaitMs = options && Number.isFinite(options.maxWaitMs) ? options.maxWaitMs : null;
        if (maxWaitMs != null && limit.waitMs() > maxWaitMs) return [];
        return startSearch(query, key, options);
    }

    async function fetchAnime(id, options = {}) {
        const key = mediaId(id);
        if (!key) return null;
        const fresh = Boolean(options && options.fresh);
        if (!fresh) {
            const cached = await readCache(details, key);
            if (cached) return { ...cached, cached: true };
            if (!key.startsWith('kitsu:')) {
                const shared = await readGuessDetail(key);
                if (shared) { void writeCache(details, key, shared); return { ...shared, cached: true }; }
            }
        }
        if (key.startsWith('kitsu:')) {
            const body = await kitsuFetch(`${KITSU_ORIGIN}/${key.slice(6)}?include=categories`);
            const media = body && body.data ? fromKitsu(body.data, body.included) : null;
            if (media) void writeCache(details, key, media);
            return media;
        }
        const body = await callAnilist(MEDIA_QUERY, { id: Number(key) });
        if (!body || !body.data) return null;
        const media = fromAnilist(body.data.Media);
        if (media) void writeCache(details, key, media);
        return media;
    }

    function getAnime(id, options = {}) {
        const key = `${mediaId(id)}:${Boolean(options.fresh)}`;
        if (detailJobs.has(key)) return detailJobs.get(key);
        const job = fetchAnime(id, options).finally(() => detailJobs.delete(key));
        detailJobs.set(key, job);
        return job;
    }

    async function loadCatalog() {
        if (catalog && catalogExpires > now()) return catalog;
        if (catalogJob) return catalogJob;
        catalogJob = (async () => {
            const [all, tags] = await Promise.all([readCache(genres, 'all'), readCache(genres, 'tags')]);
            if (all && tags) catalog = { all, tags };
            else {
                const body = await callAnilist(CATALOG_QUERY, {});
                catalog = {
                    all: body?.data?.GenreCollection ? genreNamesFrom(body.data.GenreCollection) : (all || require('./random').ANILIST_GENRES),
                    tags: body?.data?.MediaTagCollection ? curateTags(body.data.MediaTagCollection) : (tags || CURATED_TAGS),
                };
                if (body?.data) {
                    void writeCache(genres, 'all', catalog.all);
                    void writeCache(genres, 'tags', catalog.tags);
                }
            }
            catalogExpires = now() + DETAIL_TTL_MS;
            return catalog;
        })().finally(() => { catalogJob = null; });
        return catalogJob;
    }
    async function getGenres() { return (await loadCatalog()).all; }
    async function getTags() { return (await loadCatalog()).tags; }
    async function peekGenres() { return catalog?.all || (await readCache(genres, 'all')) || null; }
    async function peekTags() { return catalog?.tags || (await readCache(genres, 'tags')) || null; }

    function randomFilterKey(genreList, tagList) {
        return `${uniqueNames(genreList).sort().join('\n')}\u0000${uniqueNames(tagList).sort().join('\n')}`;
    }

    async function kitsuPage(url) {
        const body = await kitsuFetch(url);
        if (!body) return null;
        const rows = Array.isArray(body.data) ? body.data : [];
        const included = Array.isArray(body.included) ? body.included : [];
        const list = [];
        for (const item of rows) {
            if (!kitsuDecent(item && item.attributes)) continue;
            const media = fromKitsu(item, included);
            if (media) list.push(media);
        }
        return list;
    }

    async function randomFromKitsu({ genreList, tagList, page, random }) {
        if (tagList.length || genreList.length > 1) return null;
        const genre = genreList && genreList[0] ? genreList[0] : '';
        const key = `kitsu-random:${genre}:${page}`;
        let list = await readCache(searches, key);
        if (!list) list = await kitsuPage(kitsuRandomUrl({ page, genre }).toString());
        if (list?.length) void writeCache(searches, key, list);
        if (!list || !list.length) return null;
        await remember(list);
        return pickItem(list, random);
    }

    async function fetchRandomAnime(options = {}) {
        const genreList = uniqueNames(options.genres);
        const tagList = uniqueNames(options.tags);
        const random = typeof options.random === 'function' ? options.random : Math.random;
        const filterKey = randomFilterKey(genreList, tagList);
        const meta = await readCache(searches, `random-meta\n${filterKey}`);
        if (meta && meta.lastPage === 0) return { ok: false, empty: true };
        const knownLast = meta && Number.isInteger(meta.lastPage) && meta.lastPage > 0 ? meta.lastPage : null;
        const page = options.retryPage || (knownLast ? pickRandomPage(knownLast, random) : 1);
        const pageKey = `random-page\n${filterKey}\n${page}`;
        const cachedPage = await materializeList(await readCache(searches, pageKey));
        if (Array.isArray(cachedPage) && cachedPage.length) {
            const media = pickItem(cachedPage, random);
            return media
                ? { ok: true, media: { ...media, cached: true }, cached: true }
                : { ok: false, empty: true };
        }

        const built = buildRandomQuery({ page, genres: genreList, tags: tagList });
        const body = await callAnilist(built.query, built.variables);
        if (body && body.data && body.data.Page) {
            const info = body.data.Page.pageInfo || {};
            if (Number.isInteger(info.lastPage) && info.lastPage >= 0) {
                void writeCache(searches, `random-meta\n${filterKey}`, { lastPage: info.lastPage });
            }
            const list = filterRandomPool(body.data.Page.media);
            if (!list.length && !options.retryPage && info.lastPage > 0 && page > info.lastPage) {
                return fetchRandomAnime({ ...options, retryPage: pickRandomPage(info.lastPage, random) });
            }
            if (!list.length) return { ok: false, empty: true };
            remember(list);
            void writeCache(searches, pageKey, list);
            return { ok: true, media: pickItem(list, random), cached: false };
        }

        const fallback = await randomFromKitsu({ genreList, tagList, page, random });
        if (fallback) return { ok: true, media: fallback, cached: false, source: 'Kitsu' };
        return { ok: false, unavailable: true };
    }

    // A genre/era may not recur before search snapshots expire. Remember its
    // page range for a day so rotation does not keep resetting to page one.
    const guessPageRanges = createCache({ max: 32, ttlMs: DETAIL_TTL_MS, now });
    let guessScope = 0;
    let guessJob = null;
    async function fetchGuessCandidates({ random = Math.random } = {}) {
        const slot = guessScope++;
        const genreList = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
            'Mecha', 'Music', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Thriller'];
        const eras = [[null, 20000000], [19999999, 20100000], [20099999, 20200000], [20199999, null]];
        const genre = slot % 3 === 1 ? genreList[Math.floor(slot / 3) % genreList.length] : null;
        const [after, before] = slot % 3 === 2 ? eras[Math.floor(slot / 3) % eras.length] : [null, null];
        const scope = `guess-candidates-v1:${genre || ''}:${after || ''}:${before || ''}`;
        const meta = guessPageRanges.get(scope) || await readCache(searches, `${scope}:meta`);
        if (meta) guessPageRanges.set(scope, meta);
        const last = Math.max(1, Math.min(40, meta?.lastPage || 1));
        const roll = Math.min(0.999999, Math.max(0, Number(random()) || 0));
        const page = 1 + Math.floor(roll * last);
        const key = `${scope}:${page}`;
        const hit = await readCache(searches, key);
        if (Array.isArray(hit)) return { ok: true, media: hit };
        const body = await callAnilist(GUESS_CANDIDATE_QUERY, { page, genres: genre ? [genre] : null, after, before });
        const result = body?.data?.Page;
        if (!Array.isArray(result?.media) || body.errors?.length) return { ok: false, unavailable: true };
        if (Number.isInteger(result.pageInfo?.lastPage)) {
            const range = { lastPage: result.pageInfo.lastPage };
            guessPageRanges.set(scope, range);
            void writeCache(searches, `${scope}:meta`, range);
        }
        const media = result.media.filter((item) => passesRandomFilter(item)
            && item.status !== 'NOT_YET_RELEASED' && item.idMal > 0)
            .map((item) => ({ ...fromAnilist(item), ...guessContext(item) }));
        void writeCache(searches, key, media);
        remember(media);
        return { ok: true, media };
    }

    function getGuessCandidates(options) {
        if (!guessJob) guessJob = fetchGuessCandidates(options).finally(() => { guessJob = null; });
        return guessJob;
    }

    async function getGuessContext(id) {
        const key = anilistId(id);
        if (!key) return null;
        const hit = contexts.get(key);
        if (hit) return hit;
        if (contextJobs.has(key)) return contextJobs.get(key);
        if (contextJobs.size >= 8 || limit.waitMs() > 5000) return null;
        const job = (async () => {
            const body = await callAnilist(GUESS_CONTEXT_QUERY, { id: Number(key) });
            const media = body?.data?.Media;
            if (!media || body.errors?.length) return null;
            const context = guessContext(media);
            contexts.set(key, context);
            return context;
        })().catch(() => null).finally(() => contextJobs.delete(key));
        contextJobs.set(key, job);
        return job;
    }

    function randomAnime(options = {}) {
        const key = randomFilterKey(options.genres, options.tags);
        if (randomJobs.has(key)) return randomJobs.get(key);
        const job = fetchRandomAnime(options).finally(() => randomJobs.delete(key));
        randomJobs.set(key, job);
        return job;
    }

    const entityCache = createCache({ max: 300, ttlMs: SEARCH_TTL_MS, now });
    const entityJobs = new Map();

    function peekEntities(kind, text) {
        const key = `${kind}\n${normalizeTitle(text)}`;
        return entityCache.get(key) || null;
    }

    // Character, staff, or studio search for favorites. Results are cached for
    // the search lifetime; identical searches in flight share one request.
    async function searchEntities(kind, text, requestOptions = {}) {
        if (!ENTITY_QUERIES[kind]) return [];
        const query = String(text || '').trim().slice(0, 80);
        if (query.length < 2) return [];
        const key = `${kind}\n${normalizeTitle(query)}`;
        const hit = entityCache.get(key);
        if (hit) return hit;
        if (entityJobs.has(key)) return entityJobs.get(key);
        const job = (async () => {
            const body = await callAnilist(ENTITY_QUERIES[kind], { search: query }, requestOptions);
            const list = entitiesFrom(body, kind);
            if (!list) return null;
            entityCache.set(key, list);
            return list;
        })().finally(() => entityJobs.delete(key));
        entityJobs.set(key, job);
        return job;
    }

    const entityDetails = createCache({ max: 500, ttlMs: DETAIL_TTL_MS, now });
    const entityDetailJobs = new Map();

    async function getEntity(kind, rawId, requestOptions = {}) {
        const id = anilistId(rawId);
        if (!id || !DETAIL_QUERIES[kind]) return null;
        const key = `${kind}:${id}`;
        const hit = entityDetails.get(key);
        if (hit) return hit;
        if (entityDetailJobs.has(key)) return entityDetailJobs.get(key);
        const job = (async () => {
            const body = await callAnilist(DETAIL_QUERIES[kind], { id: Number(id) }, requestOptions);
            const detail = detailFrom(body, kind);
            if (detail) entityDetails.set(key, detail);
            return detail;
        })().finally(() => entityDetailJobs.delete(key));
        entityDetailJobs.set(key, job);
        return job;
    }

    // A raw AniList call through the shared limiter, for linked profiles.
    // Variables are always passed separately from the query text.
    async function anilistQuery(query, variables, requestOptions = {}) {
        return callAnilist(query, variables, { ...requestOptions, notFound: true });
    }

    return {
        search,
        searchEntities,
        peekEntities,
        getEntity,
        anilistQuery,
        getGuessContext,
        getGuessCandidates,
        getAnime,
        getGenres,
        getTags,
        peekGenres,
        peekTags,
        peekSearch,
        randomAnime,
        waitMs: () => limit.waitMs(),
        details,
        searches,
    };
}

const shared = createClient();

module.exports = {
    ANILIST_URL,
    SEARCH_QUERY,
    MEDIA_QUERY,
    GUESS_CONTEXT_QUERY,
    CATALOG_QUERY,
    CURATED_TAGS,
    RANDOM_QUERY,
    RANDOM_MIN_SCORE,
    RANDOM_MIN_POPULARITY,
    RANDOM_PER_PAGE,
    RANDOM_MAX_PAGE,
    DETAIL_TTL_MS,
    SEARCH_TTL_MS,
    MIN_INTERVAL_MS,
    MAX_PER_WINDOW,
    delayMs,
    createLimiter,
    createClient,
    autocompleteTimingEnabled,
    isAbort,
    fromAnilist,
    plainSynopsis,
    usableTag,
    curateTags,
    genreNamesFrom,
    buildRandomQuery,
    pickRandomPage,
    pickItem,
    filterRandomPool,
    categorySlug,
    kitsuRandomUrl,
    kitsuDecent,
    searchAnime: (text, options) => shared.search(text, options),
    getGuessContext: (id) => shared.getGuessContext(id),
    getAnime: (id, options) => shared.getAnime(id, options),
    ENTITY_QUERIES,
    entitiesFrom,
    searchEntities: (kind, text, options) => shared.searchEntities(kind, text, options),
    getEntity: (kind, id, options) => shared.getEntity(kind, id, options),
    detailFrom,
    peekEntities: (kind, text) => shared.peekEntities(kind, text),
    anilistQuery: (query, variables, options) => shared.anilistQuery(query, variables, options),
    getGenres: () => shared.getGenres(),
    getTags: () => shared.getTags(),
    peekGenres: () => shared.peekGenres(),
    peekTags: () => shared.peekTags(),
    peekSearch: (text, options) => shared.peekSearch(text, options),
    getGuessCandidates: (options) => shared.getGuessCandidates(options),
    randomAnime: (options) => shared.randomAnime(options),
    anilistWaitMs: () => shared.waitMs(),
};
