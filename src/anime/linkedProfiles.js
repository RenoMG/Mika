const crypto = require('node:crypto');
const LinkCode = require('../Models/LinkCode');
const ProfileLink = require('../Models/ProfileLink');
const { readJson } = require('../utils/http');
const { redact } = require('../utils/redact');
const { createCache } = require('./cache');
const { anilistQuery, createLimiter, isAbort } = require('./client');
const { anilistId, snowflake } = require('./ids');
const { cleanMarkup, containsSlur, neutralize } = require('./text');

// Linked AniList and MyAnimeList profiles. Mika is a read-only window onto
// public accounts: it stores only which account belongs to which Discord user,
// and fetches everything else when someone opens a profile, caching it briefly.
//
// Everything a site returns is untrusted. Ids must be digits, numbers must be
// in range, and text is stripped of HTML, site markup, mentions, links, and
// markdown, then length-capped and slur-filtered before it is cached or shown.
// Usernames are checked against a strict pattern and sent to AniList only as a
// GraphQL variable, and to Jikan only as an encoded path segment.

const SITES = Object.freeze({
    anilist: {
        id: 'anilist',
        label: 'AniList',
        settingsUrl: 'https://anilist.co/settings',
        bioField: 'About',
        pattern: /^[A-Za-z0-9_-]{2,20}$/,
        profileUrl: (name) => `https://anilist.co/user/${name}`,
    },
    mal: {
        id: 'mal',
        label: 'MyAnimeList',
        settingsUrl: 'https://myanimelist.net/editprofile.php',
        bioField: 'About Me',
        pattern: /^[A-Za-z0-9_-]{2,16}$/,
        profileUrl: (name) => `https://myanimelist.net/profile/${name}`,
    },
});
const SITE_IDS = Object.keys(SITES);
const CODE_TTL_MS = 30 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 6;
const PROFILE_TTL_MS = 10 * 60 * 1000;
const SHOWN = 5;
const JIKAN_ORIGIN = 'https://api.jikan.moe/v4';
const NAME_LIMIT = 8;

const MESSAGES = Object.freeze({
    username: 'That username does not look right. Use letters, numbers, - or _.',
    noUser: 'That site has no public profile with that name.',
    unavailable: 'That site is not answering right now. Try again in a few minutes.',
    noCode: 'Start again with /link. Your code may have expired.',
    codeMissing: "I couldn't find your code in that bio yet. Save your profile, wait a moment, then press Verify again.",
    tooMany: 'Too many tries. Run /link again for a new code.',
    taken: 'That account is already linked to someone else in Mika.',
});

function siteInfo(site) {
    return SITES[site] || null;
}

function validUsername(site, value) {
    const info = siteInfo(site);
    const text = typeof value === 'string' ? value.trim() : '';
    return info && info.pattern.test(text) ? text : null;
}

function makeCode(random = crypto.randomBytes) {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (const byte of random(8)) out += alphabet[byte % alphabet.length];
    return `mika-${out}`;
}

function hasCode(about, code) {
    return typeof about === 'string' && typeof code === 'string' && code.length >= 10 && about.includes(code);
}

// --- Cleaning -------------------------------------------------------------

function cleanText(value, max = 100) {
    if (typeof value !== 'string') return '';
    const text = neutralize(value.normalize('NFKC').replace(/\u0000/g, ''), max);
    if (!text || containsSlur(text)) return '';
    return text;
}

// A short plain-text bio from AniList markdown/HTML or MyAnimeList HTML.
function cleanAbout(value) {
    return cleanMarkup(value, 300);
}

function count(value, max = 1e9) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > max) return 0;
    return Math.floor(number);
}

// Scores shown out of 10, one decimal. AniList statistics use 0–100.
function tenPoint(value, scale = 10) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    const ten = scale === 100 ? number / 10 : number;
    if (ten > 10) return null;
    return Math.round(ten * 10) / 10;
}

function titleFrom(titles) {
    const source = titles && typeof titles === 'object' ? titles : {};
    return cleanText(source.english || source.romaji || source.title || '', 120);
}

function siteUrl(value, host) {
    if (typeof value !== 'string') return undefined;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === host ? url.toString() : undefined;
    } catch (error) {
        return undefined;
    }
}

function imageUrl(value) {
    if (typeof value !== 'string') return undefined;
    try {
        const url = new URL(value);
        const ok = url.protocol === 'https:'
            && (url.hostname === 's4.anilist.co' || url.hostname === 'cdn.myanimelist.net');
        return ok ? url.toString() : undefined;
    } catch (error) {
        return undefined;
    }
}

function names(list, limit = SHOWN) {
    const out = [];
    for (const value of list) {
        const text = cleanText(value, 80);
        if (text && !out.includes(text)) out.push(text);
        if (out.length >= limit) break;
    }
    return out;
}

// --- AniList --------------------------------------------------------------

const ANILIST_LOOKUP = `query ($name: String) {
  User(name: $name) { id name about }
}`;

const ANILIST_PROFILE = `query ($id: Int) {
  User(id: $id) {
    id
    name
    about
    siteUrl
    avatar { large }
    statistics { anime {
      count episodesWatched minutesWatched meanScore
      statuses(sort: COUNT_DESC) { status count }
      genres(limit: 5, sort: COUNT_DESC) { genre count }
    } }
    favourites {
      anime(perPage: 5) { nodes { id isAdult title { english romaji } } }
      characters(perPage: 5) { nodes { id name { full } } }
      staff(perPage: 5) { nodes { id name { full } } }
      studios(perPage: 5) { nodes { id name } }
    }
  }
  watching: Page(perPage: 5) {
    mediaList(userId: $id, type: ANIME, status_in: [CURRENT, REPEATING], sort: UPDATED_TIME_DESC) {
      status progress media { id isAdult episodes title { english romaji } }
    }
  }
  completed: Page(perPage: 5) {
    mediaList(userId: $id, type: ANIME, status: COMPLETED, sort: UPDATED_TIME_DESC) {
      score(format: POINT_10_DECIMAL) media { id isAdult title { english romaji } }
    }
  }
}`;

const ANILIST_STATUS = { CURRENT: 'watching', REPEATING: 'watching', COMPLETED: 'completed', PLANNING: 'planning', PAUSED: 'paused', DROPPED: 'dropped' };

function readAnilistProfile(body) {
    const data = body && body.data ? body.data : null;
    const user = data && data.User && typeof data.User === 'object' ? data.User : null;
    const id = user && anilistId(user.id);
    const name = user && validUsername('anilist', user.name);
    if (!id || !name) return null;
    const anime = user.statistics && user.statistics.anime ? user.statistics.anime : {};
    const statuses = { watching: 0, completed: 0, planning: 0, paused: 0, dropped: 0 };
    for (const row of Array.isArray(anime.statuses) ? anime.statuses : []) {
        const key = ANILIST_STATUS[row && row.status];
        if (key) statuses[key] += count(row.count);
    }
    const favs = user.favourites && typeof user.favourites === 'object' ? user.favourites : {};
    const nodes = (key) => (favs[key] && Array.isArray(favs[key].nodes) ? favs[key].nodes : []);
    const list = (key) => (data[key] && Array.isArray(data[key].mediaList) ? data[key].mediaList : []);
    return {
        site: 'anilist',
        id,
        name,
        url: siteUrl(`https://anilist.co/user/${name}`, 'anilist.co'),
        avatar: imageUrl(user.avatar && user.avatar.large),
        about: cleanAbout(user.about),
        stats: {
            count: count(anime.count),
            episodes: count(anime.episodesWatched),
            days: count(anime.minutesWatched) / 1440,
            meanScore: tenPoint(anime.meanScore, 100),
            statuses,
        },
        genres: (Array.isArray(anime.genres) ? anime.genres : [])
            .map((row) => [cleanText(row && row.genre, 40), count(row && row.count)])
            .filter(([genre]) => genre)
            .slice(0, SHOWN),
        watching: list('watching')
            .filter((row) => row && row.media && row.media.isAdult !== true)
            .map((row) => ({
                title: titleFrom(row.media.title),
                progress: count(row.progress, 10000),
                episodes: count(row.media.episodes, 10000) || null,
                rewatch: row.status === 'REPEATING',
            }))
            .filter((row) => row.title)
            .slice(0, SHOWN),
        completed: list('completed')
            .filter((row) => row && row.media && row.media.isAdult !== true)
            .map((row) => ({ title: titleFrom(row.media.title), score: tenPoint(row.score) }))
            .filter((row) => row.title)
            .slice(0, SHOWN),
        favorites: {
            anime: names(nodes('anime').filter((node) => node && node.isAdult !== true).map((node) => node.title && (node.title.english || node.title.romaji))),
            characters: names(nodes('characters').map((node) => node && node.name && node.name.full)),
            staff: names(nodes('staff').map((node) => node && node.name && node.name.full)),
            studios: names(nodes('studios').map((node) => node && node.name)),
        },
    };
}

// --- MyAnimeList (through Jikan, the public MyAnimeList API) ---------------

// Jikan allows 3 requests a second and 60 a minute; stay under both.
const jikanLimit = createLimiter({ minIntervalMs: 1100, maxPerWindow: 45, windowMs: 60000 });

async function jikanGet(path, { fetchImpl = global.fetch, limiter = jikanLimit, timeoutMs = 10000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
    try {
        const response = await limiter.schedule(() => fetchImpl(`${JIKAN_ORIGIN}${path}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'Mika Discord Bot' },
            signal: controller.signal,
        }), { signal: controller.signal });
        if (!response) return null;
        if (response.status === 404) {
            await response.body?.cancel?.();
            return { notFound: true };
        }
        if (response.status !== 200) {
            await response.body?.cancel?.();
            return null;
        }
        return await readJson(response, controller.signal);
    } catch (error) {
        if (!isAbort(error)) console.error('Jikan request failed.', redact(error));
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function readMalAbout(body) {
    const data = body && body.data && typeof body.data === 'object' ? body.data : null;
    return data && typeof data.about === 'string' ? data.about.slice(0, 20000) : '';
}

const MAL_STATUS = { Watching: true, 'Plan to Watch': false, Completed: false, 'On-Hold': false, Dropped: false };

function readMalProfile(fullBody, aboutBody) {
    const data = fullBody && fullBody.data && typeof fullBody.data === 'object' ? fullBody.data : null;
    const name = data && validUsername('mal', data.username);
    if (!name) return null;
    const anime = data.statistics && data.statistics.anime ? data.statistics.anime : {};
    const favs = data.favorites && typeof data.favorites === 'object' ? data.favorites : {};
    const updates = data.updates && Array.isArray(data.updates.anime) ? data.updates.anime : [];
    const pick = (key) => (Array.isArray(favs[key]) ? favs[key] : []);
    const updateTitle = (row) => cleanText(row && row.entry && row.entry.title, 120);
    return {
        site: 'mal',
        id: anilistId(data.mal_id) || '',
        name,
        url: siteUrl(`https://myanimelist.net/profile/${name}`, 'myanimelist.net'),
        avatar: imageUrl(data.images && data.images.jpg && data.images.jpg.image_url),
        about: cleanAbout(readMalAbout(aboutBody)),
        stats: {
            count: count(anime.total_entries),
            episodes: count(anime.episodes_watched),
            days: Number.isFinite(Number(anime.days_watched)) && Number(anime.days_watched) >= 0 ? Number(anime.days_watched) : 0,
            meanScore: tenPoint(anime.mean_score),
            statuses: {
                watching: count(anime.watching),
                completed: count(anime.completed),
                planning: count(anime.plan_to_watch),
                paused: count(anime.on_hold),
                dropped: count(anime.dropped),
            },
        },
        genres: [],
        watching: updates
            .filter((row) => row && MAL_STATUS[row.status] === true)
            .map((row) => ({
                title: updateTitle(row),
                progress: count(row.episodes_seen, 10000),
                episodes: count(row.episodes_total, 10000) || null,
                rewatch: false,
            }))
            .filter((row) => row.title)
            .slice(0, SHOWN),
        completed: updates
            .filter((row) => row && row.status === 'Completed')
            .map((row) => ({ title: updateTitle(row), score: tenPoint(row.score) }))
            .filter((row) => row.title)
            .slice(0, SHOWN),
        favorites: {
            anime: names(pick('anime').map((item) => item && item.title)),
            characters: names(pick('characters').map((item) => item && item.name)),
            staff: names(pick('people').map((item) => item && item.name)),
            studios: [],
        },
    };
}

// --- Fetching with a short cache ------------------------------------------

const profiles = createCache({ max: 500, ttlMs: PROFILE_TTL_MS });
const jobs = new Map();

function cacheKey(site, account) {
    return site === 'anilist' ? `anilist:${account.id}` : `mal:${String(account.name).toLowerCase()}`;
}

async function loadRemote(site, account, deps = {}) {
    if (site === 'anilist') {
        const id = anilistId(account && account.id);
        if (!id) return { ok: false, reason: 'noUser' };
        const body = await (deps.anilistQuery || anilistQuery)(ANILIST_PROFILE, { id: Number(id) }, { timeoutMs: 8000 });
        if (!body) return { ok: false, reason: 'unavailable' };
        if (body.notFound) return { ok: false, reason: 'noUser' };
        const profile = readAnilistProfile(body);
        return profile ? { ok: true, profile } : { ok: false, reason: 'noUser' };
    }
    const name = validUsername('mal', account && account.name);
    if (!name) return { ok: false, reason: 'noUser' };
    const get = deps.jikanGet || jikanGet;
    const path = `/users/${encodeURIComponent(name)}`;
    const [full, about] = await Promise.all([get(`${path}/full`), get(`${path}/about`)]);
    if (!full) return { ok: false, reason: 'unavailable' };
    if (full.notFound) return { ok: false, reason: 'noUser' };
    const profile = readMalProfile(full, about && !about.notFound ? about : null);
    return profile ? { ok: true, profile } : { ok: false, reason: 'noUser' };
}

// One fetch per account per 10 minutes. Concurrent opens share the request.
async function fetchProfile(site, account, deps = {}) {
    if (!siteInfo(site)) return { ok: false, reason: 'noUser' };
    const key = cacheKey(site, account || {});
    const hit = (deps.cache || profiles).get(key);
    if (hit) return { ok: true, profile: hit, cached: true };
    if (jobs.has(key)) return jobs.get(key);
    const job = loadRemote(site, account, deps)
        .then((result) => {
            if (result.ok) (deps.cache || profiles).set(key, result.profile);
            return result;
        })
        .finally(() => jobs.delete(key));
    jobs.set(key, job);
    return job;
}

function forgetProfile(site, account) {
    profiles.delete(cacheKey(site, account || {}));
}

// --- Linking --------------------------------------------------------------

async function lookupForVerify(site, username, deps = {}) {
    if (site === 'anilist') {
        const body = await (deps.anilistQuery || anilistQuery)(ANILIST_LOOKUP, { name: username }, { timeoutMs: 8000 });
        if (!body) return { ok: false, reason: 'unavailable' };
        const user = body.data && body.data.User;
        if (body.notFound || !user) return { ok: false, reason: 'noUser' };
        const id = anilistId(user.id);
        const name = validUsername('anilist', user.name);
        if (!id || !name) return { ok: false, reason: 'noUser' };
        return { ok: true, id, name, about: typeof user.about === 'string' ? user.about.slice(0, 20000) : '' };
    }
    const get = deps.jikanGet || jikanGet;
    const path = `/users/${encodeURIComponent(username)}`;
    const about = await get(`${path}/about`);
    if (!about) return { ok: false, reason: 'unavailable' };
    if (about.notFound) return { ok: false, reason: 'noUser' };
    // The profile itself gives the canonical spelling of the name.
    const full = await get(path);
    const data = full && full.data && typeof full.data === 'object' ? full.data : null;
    const name = validUsername('mal', data && data.username) || validUsername('mal', username);
    if (!name) return { ok: false, reason: 'noUser' };
    return { ok: true, id: anilistId(data && data.mal_id) || '', name, about: readMalAbout(about) };
}

async function startLink(userId, site, rawName, { Code = LinkCode, now = Date.now() } = {}) {
    const id = snowflake(userId);
    if (!id || !siteInfo(site)) return { ok: false, reason: 'noUser' };
    const username = validUsername(site, rawName);
    if (!username) return { ok: false, reason: 'username' };
    const code = makeCode();
    const expiresAt = new Date(now + CODE_TTL_MS);
    await Code.findOneAndUpdate(
        { userId: id, site },
        { $set: { username, code, attempts: 0, expiresAt } },
        { upsert: true, setDefaultsOnInsert: true },
    );
    return { ok: true, code, username, expiresAt, site };
}

async function claimAttempt(userId, site, { Code = LinkCode, now = Date.now() } = {}) {
    const row = await Code.findOneAndUpdate(
        { userId, site, expiresAt: { $gt: new Date(now) }, attempts: { $lt: MAX_VERIFY_ATTEMPTS } },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' },
    ).lean();
    if (row) return { ok: true, row };
    const any = await Code.findOne({ userId, site }).lean();
    if (any && any.expiresAt > new Date(now) && any.attempts >= MAX_VERIFY_ATTEMPTS) return { ok: false, reason: 'tooMany' };
    return { ok: false, reason: 'noCode' };
}

function cleanName(value) {
    return typeof value === 'string' ? neutralize(value, 32) : '';
}

// Discord names Mika can see now, for /findprofile.
function rememberNames(link, user, member) {
    const found = [user && user.globalName, user && user.username, member && member.nickname]
        .map(cleanName)
        .filter(Boolean);
    if (!found.length) return false;
    const next = [];
    for (const value of found.concat(Array.isArray(link.names) ? link.names : [])) {
        const key = String(value).toLowerCase();
        if (key && !next.includes(key) && next.length < NAME_LIMIT) next.push(key);
    }
    const label = found[0];
    const changed = next.join('\n') !== (link.names || []).join('\n') || link.nameLabel !== label;
    link.names = next;
    link.nameLabel = label;
    return changed;
}

// Checks the code against the live bio, then links the account. An account
// can belong to one Discord user; proving it again moves the link.
async function verifyLink(userId, site, deps = {}) {
    const id = snowflake(userId);
    const now = deps.now || Date.now();
    if (!id || !siteInfo(site)) return { ok: false, reason: 'noCode' };
    const Code = deps.Code || LinkCode;
    const Link = deps.Link || ProfileLink;
    const claim = await claimAttempt(id, site, { Code, now });
    if (!claim.ok) return claim;
    const found = await lookupForVerify(site, claim.row.username, deps);
    if (!found.ok) return found;
    if (!hasCode(found.about, claim.row.code)) return { ok: false, reason: 'codeMissing' };
    const field = site === 'anilist' ? 'anilist' : 'mal';
    const match = site === 'anilist' ? { 'anilist.id': found.id } : { 'mal.name': { $regex: `^${escapeRegex(found.name)}$`, $options: 'i' } };
    await Link.updateMany({ ...match, userId: { $ne: id } }, { $unset: { [field]: 1 } });
    const link = (await Link.findOne({ userId: id })) || new Link({ userId: id });
    link[field] = { id: found.id || undefined, name: found.name, verifiedAt: new Date(now) };
    if (deps.user) rememberNames(link, deps.user, deps.member);
    await link.save();
    await Code.deleteOne({ userId: id, site });
    forgetProfile(site, { id: found.id, name: found.name });
    return { ok: true, site, name: found.name };
}

async function getLink(userId, { Link = ProfileLink } = {}) {
    const id = snowflake(userId);
    return id ? Link.findOne({ userId: id }) : null;
}

async function unlink(userId, site, { Link = ProfileLink, Code = LinkCode } = {}) {
    const id = snowflake(userId);
    if (!id) return { ok: false };
    const sites = site === 'all' ? SITE_IDS : [site].filter((value) => siteInfo(value));
    const link = await Link.findOne({ userId: id });
    const had = sites.filter((value) => link && link[value === 'anilist' ? 'anilist' : 'mal']);
    if (link) {
        for (const value of sites) link[value === 'anilist' ? 'anilist' : 'mal'] = undefined;
        if (!link.anilist && !link.mal) await Link.deleteOne({ userId: id });
        else await link.save();
    }
    await Code.deleteMany({ userId: id, site: { $in: sites } });
    return { ok: had.length > 0, removed: had };
}

function linkedSites(link) {
    const out = [];
    if (link && link.anilist && link.anilist.name) out.push('anilist');
    if (link && link.mal && link.mal.name) out.push('mal');
    return out;
}

function accountFor(link, site) {
    const row = link && link[site === 'anilist' ? 'anilist' : 'mal'];
    return row && row.name ? { id: row.id, name: row.name } : null;
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Linked profiles whose Discord or site name matches. The caller keeps only
// members of its own server.
async function searchLinks(query, { Link = ProfileLink, limit = 25 } = {}) {
    const text = typeof query === 'string' ? query.trim().slice(0, 32) : '';
    if (text.length < 2) return [];
    const pattern = { $regex: escapeRegex(text), $options: 'i' };
    const clauses = [{ names: { $regex: `^${escapeRegex(text.toLowerCase())}` } }, { 'anilist.name': pattern }, { 'mal.name': pattern }];
    const id = snowflake(text);
    if (id) clauses.push({ userId: id });
    return Link.find({ $or: clauses }).select('userId nameLabel anilist.name mal.name').limit(limit).maxTimeMS(800).lean();
}

function resetLinkedProfiles() {
    profiles.clear();
    jobs.clear();
}

module.exports = {
    SITES,
    SITE_IDS,
    CODE_TTL_MS,
    MAX_VERIFY_ATTEMPTS,
    PROFILE_TTL_MS,
    MESSAGES,
    ANILIST_LOOKUP,
    ANILIST_PROFILE,
    siteInfo,
    validUsername,
    makeCode,
    hasCode,
    cleanAbout,
    tenPoint,
    readAnilistProfile,
    readMalProfile,
    jikanGet,
    fetchProfile,
    forgetProfile,
    lookupForVerify,
    startLink,
    verifyLink,
    getLink,
    unlink,
    linkedSites,
    accountFor,
    rememberNames,
    searchLinks,
    resetLinkedProfiles,
};
