const { redact } = require('../utils/redact');
const {
    CACHE_OP_MS,
    DETAIL_TTL_MS,
    SEARCH_TTL_MS,
    createMongoCache,
    readGuessDetail,
} = require('./cache');
const { normalizeTitle } = require('./match');
const { anilistId, mediaId } = require('./ids');

const ANILIST_URL = 'https://graphql.anilist.co';
const KITSU_ORIGIN = 'https://kitsu.app/api/edge/anime';
const SKIP_MS = 1500;
const MIN_INTERVAL_MS = 2500;
const MAX_PER_WINDOW = 24;
const WINDOW_MS = 60 * 1000;

const MEDIA_FIELDS = `
  id
  idMal
  isAdult
  siteUrl
  description
  episodes
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

const GENRE_QUERY = 'query { GenreCollection }';

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

function waitForAbort(signal) {
    if (!signal) return { promise: new Promise(() => {}), cancel() {} };
    if (signal.aborted) return { promise: Promise.resolve(), cancel() {} };
    let onAbort = null;
    const promise = new Promise((resolve) => {
        onAbort = () => resolve();
        signal.addEventListener('abort', onAbort, { once: true });
    });
    return {
        promise,
        cancel() {
            if (onAbort) signal.removeEventListener('abort', onAbort);
        },
    };
}

function createLimiter({
    maxPerWindow = MAX_PER_WINDOW,
    windowMs = WINDOW_MS,
    minIntervalMs = MIN_INTERVAL_MS,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
    const stamps = [];
    const tokens = [];
    let seq = 0;
    let pauseUntil = 0;
    let tail = Promise.resolve();

    function waitMs() {
        return delayMs({
            now: now(),
            stamps,
            pauseUntil,
            minIntervalMs,
            maxPerWindow,
            windowMs,
        });
    }

    function noteRetryAfter(ms) {
        const delay = Math.min(Math.max(0, Number(ms) || 0), 120000);
        pauseUntil = Math.max(pauseUntil, now() + delay);
    }

    function releaseStamp(id) {
        const index = tokens.indexOf(id);
        if (index < 0) return;
        tokens.splice(index, 1);
        stamps.splice(index, 1);
    }

    // A signal that aborts before the stamp is pushed never takes a slot.
    // Aborting after the stamp drops that stamp so the next caller is not
    // blocked by a request nobody is waiting for.
    function schedule(run, options = {}) {
        const signal = options && options.signal;
        const job = tail.then(async () => {
            let wait = waitMs();
            while (wait > 0) {
                if (signal && signal.aborted) throw abortError();
                const aborted = waitForAbort(signal);
                try {
                    await Promise.race([sleep(wait), aborted.promise]);
                } finally {
                    aborted.cancel();
                }
                if (signal && signal.aborted) throw abortError();
                wait = waitMs();
            }
            if (signal && signal.aborted) throw abortError();
            const id = ++seq;
            stamps.push(now());
            tokens.push(id);
            const release = () => releaseStamp(id);
            if (signal && signal.aborted) {
                release();
                throw abortError();
            }
            if (signal) signal.addEventListener('abort', release, { once: true });
            try {
                return await run();
            } finally {
                if (signal && signal.aborted) release();
                if (signal) signal.removeEventListener('abort', release);
            }
        });
        tail = job.then(() => {}, () => {});
        return job;
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
    detailCache,
    searchCache,
    genreCache,
} = {}) {
    const limit = limiter || createLimiter({ now, sleep });
    // Mongo only. No process-local layer, so shards cannot disagree about a hit.
    const details = detailCache || createMongoCache({ kind: 'detail', ttlMs: DETAIL_TTL_MS, now });
    const searches = searchCache || createMongoCache({ kind: 'search', ttlMs: SEARCH_TTL_MS, now });
    const genres = genreCache || createMongoCache({ kind: 'genre', ttlMs: DETAIL_TTL_MS, now });
    const inflight = new Map();
    let catalogJob = null;

    async function remember(list) {
        for (const media of list) {
            if (media && media.id) await writeCache(details, media.id, media);
        }
        return list;
    }

    function searchIds(list) {
        const ids = [];
        for (const media of list || []) {
            if (!media || media.id == null || typeof media.id === 'object') continue;
            ids.push(String(media.id));
        }
        return ids;
    }

        // Search entries store AniList ids. The full record lives in the details
        // cache. One missing id is a miss, so the caller fetches live instead of
        // returning a partial list. An empty list is not a hit.
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
        const trace = requestOptions.trace;
        const parent = requestOptions.signal;
        const timeoutMs = Number.isFinite(requestOptions.timeoutMs) ? requestOptions.timeoutMs : 8000;
        if (parent && parent.aborted) return null;
        if (limit.waitMs() >= SKIP_MS) {
            if (trace) trace.anilistSkipped = true;
            return null;
        }
        const linked = controlSignal(parent, timeoutMs);
        let response;
        try {
            response = await limit.schedule(() => fetchImpl(ANILIST_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'User-Agent': 'Mika Discord Bot',
                },
                body: JSON.stringify({ query, variables }),
                signal: linked.signal,
            }), { signal: linked.signal });
        } catch (error) {
            if (!isAbort(error)) console.error(redact(error));
            return null;
        } finally {
            linked.cancel();
        }
        if (!response) return null;
        if (trace) {
            trace.anilistStatus = response.status;
            trace.rateLimitRemaining = headerValue(response, 'x-ratelimit-remaining');
            const retryAfter = headerValue(response, 'retry-after');
            if (retryAfter != null) trace.retryAfter = retryAfter;
        }
        if (response.status === 429) {
            limit.noteRetryAfter(retryAfterMs(response, now()));
            return null;
        }
        if (response.status !== 200) return null;
        try {
            return await response.json();
        } catch (error) {
            console.error(redact(error));
            return null;
        }
    }

    async function kitsuFetch(url, requestOptions = {}) {
        const trace = requestOptions.trace;
        const timeoutMs = Number.isFinite(requestOptions.timeoutMs) ? requestOptions.timeoutMs : 8000;
        const started = Date.now();
        const linked = controlSignal(requestOptions.signal, timeoutMs);
        try {
            const response = await fetchImpl(url, {
                headers: {
                    Accept: 'application/vnd.api+json',
                    'User-Agent': 'Mika Discord Bot',
                },
                signal: linked.signal,
            });
            if (trace) {
                trace.kitsuMs = Date.now() - started;
                trace.kitsuStatus = response ? response.status : 0;
            }
            if (!response || response.status !== 200) return null;
            return await response.json();
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

    function anilistIdsOf(list) {
        const ids = [];
        const seen = new Set();
        for (const media of list || []) {
            const id = anilistId(media && media.id);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }
        return ids;
    }

    // Detail writes and the search-id write run together and are not awaited
    // by the caller. A Kitsu-only list, or a list with no numeric AniList id,
    // is not stored as a search hit. Autocomplete cannot render those ids, and
    // a stored list would stay an empty menu until the search TTL.
    function persistSearch(list, key) {
        const tasks = [];
        const ids = anilistIdsOf(list);
        for (const media of list || []) {
            if (!ids.length) break;
            const id = anilistId(media && media.id);
            if (!id) continue;
            tasks.push(writeCache(details, id, media));
        }
        if (ids.length) tasks.push(writeCache(searches, key, ids));
        const pending = Promise.all(tasks).then(() => {}, (error) => {
            if (autocompleteTimingEnabled()) console.debug(redact(error));
        });
        return pending;
    }

    function watchAbort(signal, entry) {
        if (!signal) return;
        const onAbort = () => {
            entry.refs -= 1;
            if (entry.refs <= 0 && !entry.controller.signal.aborted) entry.controller.abort();
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
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
        if (!body || !body.data) return null;
        const media = body.data.Page && Array.isArray(body.data.Page.media) ? body.data.Page.media : [];
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

    function startSearch(query, key, requestOptions = {}) {
        const trace = requestOptions.trace;
        const signal = requestOptions.signal;
        const existing = inflight.get(key);
        if (existing && !existing.controller.signal.aborted) {
            if (signal && signal.aborted) {
                if (trace) trace.superseded = true;
                return Promise.resolve([]);
            }
            existing.refs += 1;
            watchAbort(signal, existing);
            if (trace) trace.deduped = true;
            return existing.promise;
        }
        if (signal && signal.aborted) {
            if (trace) trace.superseded = true;
            return Promise.resolve([]);
        }
        const entry = {
            refs: 1,
            controller: new AbortController(),
            writes: null,
            promise: null,
        };
        watchAbort(signal, entry);
        const job = (async () => {
            const started = Date.now();
            try {
                const providerOptions = {
                    trace,
                    signal: entry.controller.signal,
                    budgetMs: requestOptions.budgetMs,
                    autocomplete: Number.isFinite(requestOptions.budgetMs) || Boolean(signal),
                };
                let list = await searchAnilist(query, providerOptions);
                if (!list && !entry.controller.signal.aborted) {
                    const spent = Date.now() - started;
                    const budget = requestOptions.budgetMs;
                    const leftover = Number.isFinite(budget) ? budget - spent : null;
                    if (leftover == null || leftover > 0) {
                        list = await searchKitsu(query, {
                            trace,
                            signal: entry.controller.signal,
                            timeoutMs: leftover == null ? 8000 : leftover,
                        });
                    }
                }
                if (!Array.isArray(list)) return [];
                entry.writes = persistSearch(list, key);
                return list;
            } catch (error) {
                if (!isAbort(error)) console.error(redact(error));
                return [];
            } finally {
                const finish = () => {
                    if (inflight.get(key) === entry) inflight.delete(key);
                };
                if (entry.writes) entry.writes.then(finish, finish);
                else finish();
            }
        })();
        entry.promise = job;
        inflight.set(key, entry);
        return job;
    }

    async function peekSearch(text, requestOptions = {}) {
        const query = typeof text === 'string' ? text.trim() : '';
        const key = normalizeTitle(query);
        const trace = requestOptions && requestOptions.trace;
        if (!key) {
            if (trace) {
                trace.cacheMs = 0;
                trace.cachePhase = 'miss';
            }
            return null;
        }
        const hit = await readCache(searches, key, trace);
        if (hit == null) return null;
        const list = await materializeList(hit);
        if (!list || !list.length || !listHasAnilist(list)) {
            if (trace && trace.cachePhase === 'hit') trace.cachePhase = 'miss';
            return null;
        }
        return list;
    }

    async function search(text, options = {}) {
        const query = typeof text === 'string' ? text.trim() : '';
        const key = normalizeTitle(query);
        const trace = options && options.trace;
        if (!key) return [];
        if (options.signal && options.signal.aborted) {
            if (trace) trace.superseded = true;
            return [];
        }
        const cached = await readCache(searches, key, trace);
        const hydrated = await materializeList(cached);
        if (hydrated && hydrated.length && listHasAnilist(hydrated)) {
            return hydrated.map((media) => ({ ...media, cached: true }));
        }
        if (trace && trace.cachePhase === 'hit') trace.cachePhase = 'miss';
        if (options.signal && options.signal.aborted) {
            if (trace) trace.superseded = true;
            return [];
        }
        const pending = startSearch(query, key, options);
        const maxWaitMs = options && Number.isFinite(options.maxWaitMs) ? options.maxWaitMs : null;
        if (maxWaitMs != null && limit.waitMs() > maxWaitMs) return [];
        return pending;
    }

    async function getAnime(id, options = {}) {
        const key = mediaId(id);
        if (!key) return null;
        const fresh = Boolean(options && options.fresh);
        if (!fresh) {
            const cached = await readCache(details, key);
            if (cached) return { ...cached, cached: true };
            if (!key.startsWith('kitsu:')) {
                const shared = await readGuessDetail(key);
                if (shared) return { ...shared, cached: true };
            }
        }
        if (key.startsWith('kitsu:')) {
            const body = await kitsuFetch(`${KITSU_ORIGIN}/${key.slice(6)}?include=categories`);
            const media = body && body.data ? fromKitsu(body.data, body.included) : null;
            if (media) await writeCache(details, key, media);
            return media;
        }
        const body = await callAnilist(MEDIA_QUERY, { id: Number(key) });
        if (!body || !body.data) return null;
        const media = fromAnilist(body.data.Media);
        if (media) await writeCache(details, key, media);
        return media;
    }

    async function loadCatalog() {
        const [haveAll, haveTags] = await Promise.all([
            readCache(genres, 'all'),
            readCache(genres, 'tags'),
        ]);
        if (haveAll && haveTags) return;
        if (catalogJob) return catalogJob;
        catalogJob = (async () => {
            const body = await callAnilist(CATALOG_QUERY, {});
            if (!body || !body.data) return;
            const [stillAll, stillTags] = await Promise.all([
                readCache(genres, 'all'),
                readCache(genres, 'tags'),
            ]);
            if (!stillAll && Array.isArray(body.data.GenreCollection)) {
                await writeCache(genres, 'all', genreNamesFrom(body.data.GenreCollection));
            }
            if (!stillTags && Array.isArray(body.data.MediaTagCollection)) {
                await writeCache(genres, 'tags', curateTags(body.data.MediaTagCollection));
            }
        })().finally(() => {
            catalogJob = null;
        });
        return catalogJob;
    }

    async function getGenres() {
        if (!(await readCache(genres, 'all'))) await loadCatalog();
        return (await readCache(genres, 'all')) || [];
    }

    async function getTags() {
        if (!(await readCache(genres, 'tags'))) await loadCatalog();
        return (await readCache(genres, 'tags')) || [];
    }

    async function peekGenres() {
        return (await readCache(genres, 'all')) || null;
    }

    async function peekTags() {
        return (await readCache(genres, 'tags')) || null;
    }

    function randomFilterKey(genreList, tagList) {
        return `${uniqueNames(genreList).join('\n')}\u0000${uniqueNames(tagList).join('\n')}`;
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

    async function randomFromKitsu({ genreList, page, random }) {
        const genre = genreList && genreList[0] ? genreList[0] : '';
        let list = await kitsuPage(kitsuRandomUrl({ page, genre }).toString());
        if (list && !list.length && categorySlug(genre)) {
            list = await kitsuPage(kitsuRandomUrl({ page, genre: '' }).toString());
        }
        if (!list || !list.length) return null;
        await remember(list);
        return pickItem(list, random);
    }

    async function randomAnime(options = {}) {
        const genreList = uniqueNames(options.genres);
        const tagList = uniqueNames(options.tags);
        const random = typeof options.random === 'function' ? options.random : Math.random;
        const filterKey = randomFilterKey(genreList, tagList);
        const meta = await readCache(searches, `random-meta\n${filterKey}`);
        if (meta && meta.lastPage === 0) return { ok: false, empty: true };
        const knownLast = meta && Number.isInteger(meta.lastPage) && meta.lastPage > 0 ? meta.lastPage : null;
        const page = pickRandomPage(knownLast || RANDOM_MAX_PAGE, random);
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
                await writeCache(searches, `random-meta\n${filterKey}`, { lastPage: info.lastPage });
            }
            const list = filterRandomPool(body.data.Page.media);
            if (!list.length) return { ok: false, empty: true };
            await remember(list);
            await writeCache(searches, pageKey, searchIds(list));
            return { ok: true, media: pickItem(list, random), cached: false };
        }

        const fallback = await randomFromKitsu({ genreList, page, random });
        if (fallback) return { ok: true, media: fallback, cached: false, source: 'Kitsu' };
        return { ok: false, unavailable: true };
    }

    return {
        search,
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
    GENRE_QUERY,
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
    getAnime: (id, options) => shared.getAnime(id, options),
    getGenres: () => shared.getGenres(),
    getTags: () => shared.getTags(),
    peekGenres: () => shared.peekGenres(),
    peekTags: () => shared.peekTags(),
    peekSearch: (text) => shared.peekSearch(text),
    randomAnime: (options) => shared.randomAnime(options),
    anilistWaitMs: () => shared.waitMs(),
};
