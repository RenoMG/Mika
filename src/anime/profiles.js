const AnimeProfile = require('../Models/AnimeProfile');
const { FullListNotice, PendingRecommendation } = require('../Models/AnimeRecommend');
const {
    isCurrent,
    markLatest,
    noteAutocompleteError,
    remainingBudget,
    safeRespond,
} = require('./autocomplete');
const { favoriteLabel } = require('./favorites');
const { snowflake } = require('./ids');
const { containsSlur, neutralize } = require('./text');

const HIDDEN = "That profile isn't available.";
const SETUP_FIRST = 'Create a profile with /setup first.';
const NOT_SETUP = "That person hasn't set up an anime profile.";
const NOT_FOUND = 'No profile matched that.';
const QUERY_MAX = 32;
const RESULT_CAP = 25;
const NAME_LIMIT = 8;

function visibilityFor({ self, sameGuild, hasProfile, discoverable }) {
    if (self) {
        if (!hasProfile) return { show: false, ephemeral: true, reason: 'setup' };
        return { show: true, ephemeral: false, reason: 'self' };
    }
    if (sameGuild && hasProfile) return { show: true, ephemeral: false, reason: 'guild' };
    if (hasProfile && discoverable) return { show: true, ephemeral: false, reason: 'discoverable' };
    if (sameGuild) return { show: false, ephemeral: true, reason: 'missing' };
    return { show: false, ephemeral: true, reason: 'hidden' };
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getProfile(userId) {
    const id = snowflake(userId);
    if (!id) return null;
    return AnimeProfile.findOne({ userId: id });
}

async function profileForViewer(targetId, viewerId, options = {}) {
    const viewer = snowflake(viewerId);
    const target = snowflake(targetId);
    if (!viewer || !target) return { show: false, ephemeral: true, message: HIDDEN };
    const profile = await getProfile(target);
    const decision = visibilityFor({
        self: viewer === target,
        sameGuild: options.sameGuild === true || viewer === target,
        hasProfile: Boolean(profile),
        discoverable: Boolean(profile && profile.discoverable === true),
    });
    if (!decision.show) {
        const message = decision.reason === 'setup'
            ? SETUP_FIRST
            : (decision.reason === 'missing' ? NOT_SETUP : HIDDEN);
        return { show: false, ephemeral: true, self: decision.reason === 'setup', message };
    }
    return { show: true, ephemeral: false, profile, self: decision.reason === 'self' };
}

function cleanName(value) {
    if (typeof value !== 'string') return '';
    return neutralize(value, QUERY_MAX);
}

function identityNames(user, member) {
    const found = [];
    const push = (value) => {
        const clean = cleanName(value);
        if (clean) found.push(clean);
    };
    push(user && user.globalName);
    push(user && user.username);
    push(member && member.nickname);
    const nested = member && member.user;
    if (nested && nested !== user) {
        push(nested.globalName);
        push(nested.username);
    }
    return found;
}

function labelFor(user, member) {
    return cleanName(user && user.globalName)
        || cleanName(user && user.username)
        || cleanName(member && member.nickname)
        || '';
}

// Merges names Mika can see right now. Does not drop a stored nickname unless
// the capped list is full, and does nothing when no name was provided.
function rememberNames(profile, user, member) {
    if (!profile || typeof profile !== 'object') return false;
    const incoming = identityNames(user, member);
    const label = labelFor(user, member);
    if (!incoming.length && !label) return false;
    const current = Array.isArray(profile.names)
        ? profile.names.filter((item) => typeof item === 'string' && item)
        : [];
    const next = [];
    const push = (key) => {
        if (typeof key !== 'string' || !key || next.includes(key) || next.length >= NAME_LIMIT) return;
        next.push(key);
    };
    for (const value of incoming) push(value.toLowerCase());
    for (const value of current) push(String(value).toLowerCase());
    let changed = false;
    if (next.join('\n') !== current.map((value) => String(value).toLowerCase()).join('\n')) {
        profile.names = next;
        if (typeof profile.markModified === 'function') profile.markModified('names');
        changed = true;
    }
    if (label && profile.nameLabel !== label) {
        profile.nameLabel = label;
        changed = true;
    }
    return changed;
}

async function noteIdentity(profile, user, member) {
    if (!profile || typeof profile.save !== 'function') return false;
    if (!rememberNames(profile, user, member)) return false;
    await profile.save();
    return true;
}

function searchPattern(query) {
    if (typeof query !== 'string') return null;
    const text = query.trim().slice(0, QUERY_MAX);
    if (!text) return null;
    return { text, pattern: escapeRegex(text) };
}

function regexClause(path, pattern) {
    return { [path]: { $regex: pattern, $options: 'i' } };
}

async function searchProfiles(query, options = {}) {
    const parsed = searchPattern(query);
    if (!parsed || parsed.text.length < 2) return [];
    const includeSelf = Boolean(options && options.includeSelf === true);
    const namesOnly = Boolean(options && options.namesOnly === true);
    // local: only profiles that are not discoverable. The caller must keep only
    // the ones whose owner shares the viewer's server.
    const localOnly = Boolean(options && options.local === true);
    const viewer = includeSelf && !localOnly ? snowflake(options && options.viewerId) : null;
    const clauses = [];
    if (!namesOnly) {
        clauses.push(
            regexClause('bio', parsed.pattern),
            regexClause('watching', parsed.pattern),
            regexClause('watchingList.title', parsed.pattern),
            regexClause('favoriteTitle', parsed.pattern),
            regexClause('favorites.title', parsed.pattern),
            regexClause('genres', parsed.pattern),
            regexClause('tags', parsed.pattern),
        );
    }
    clauses.push(namesOnly ? { names: { $regex: `^${escapeRegex(parsed.text.toLowerCase())}` } } : regexClause('names', parsed.pattern));
    const id = snowflake(parsed.text);
    if (id) clauses.push({ userId: id });
    let visibility = viewer
        ? { $or: [{ discoverable: true }, { userId: viewer }] }
        : { discoverable: true };
    if (localOnly) visibility = { discoverable: { $ne: true } };
    const results = await AnimeProfile.find({
        userId: { $type: 'string' },
        $and: [
            visibility,
            { $or: clauses },
        ],
    }).select('userId discoverable nameLabel names favoriteId favoriteTitle favorites genres').limit(RESULT_CAP).maxTimeMS(800).lean();
    if (!viewer || results.some((profile) => profile.userId === viewer)) return results;
    const own = await AnimeProfile.findOne({
        userId: viewer,
        $or: clauses,
    }).select('userId discoverable nameLabel names favoriteId favoriteTitle favorites genres').maxTimeMS(300).lean();
    if (!own) return results;
    return [own].concat(results).slice(0, RESULT_CAP);
}

function profileDescription(profile) {
    const favorite = neutralize(favoriteLabel(profile), 100);
    if (favorite) return favorite;
    const genres = [];
    for (const genre of (profile && profile.genres) || []) {
        const text = neutralize(genre, 40);
        if (text && !genres.includes(text)) genres.push(text);
    }
    if (!genres.length) return '';
    return genres.join(', ').slice(0, 100);
}

function profileVisible(profile, viewerId, includeSelf, localIds) {
    if (profile && profile.discoverable === true) return true;
    const id = snowflake(profile && profile.userId);
    if (id && localIds && typeof localIds.has === 'function' && localIds.has(id)) return true;
    if (includeSelf !== true) return false;
    const viewer = snowflake(viewerId);
    return Boolean(id && viewer && id === viewer);
}

// Ids from the list whose owner is a member of this guild. The member cache is
// read first; fetch is only used when allowed, because autocomplete has no time for it.
async function guildMemberIds(guild, ids, { fetch = true } = {}) {
    const found = new Set();
    const wanted = [...new Set((ids || []).map((id) => snowflake(id)).filter(Boolean))];
    if (!guild || !guild.members || !wanted.length) return found;
    const cache = guild.members.cache;
    const missing = [];
    for (const id of wanted) {
        if (cache && typeof cache.has === 'function' && cache.has(id)) found.add(id);
        else missing.push(id);
    }
    if (!fetch || !missing.length || typeof guild.members.fetch !== 'function') return found;
    try {
        const fetched = await guild.members.fetch({ user: missing });
        if (fetched && typeof fetched.keys === 'function') {
            for (const id of fetched.keys()) if (missing.includes(id)) found.add(id);
        }
    } catch (error) {
        // Members that cannot be fetched stay hidden.
    }
    return found;
}

async function isGuildMember(guild, userId) {
    const id = snowflake(userId);
    if (!id) return false;
    return (await guildMemberIds(guild, [id])).has(id);
}

// Global matches plus local profiles of people in this server, without repeats.
function mergeProfiles(global, local, localIds) {
    const merged = [];
    const seen = new Set();
    for (const profile of (global || []).concat((local || []).filter((item) => localIds.has(snowflake(item && item.userId))))) {
        const id = snowflake(profile && profile.userId);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(profile);
        if (merged.length >= RESULT_CAP) break;
    }
    return merged;
}

async function searchVisibleProfiles(query, { guild, search = searchProfiles, options = {}, fetchMembers = true } = {}) {
    const [global, local] = await Promise.all([
        search(query, options),
        guild ? search(query, { ...options, includeSelf: false, local: true }) : [],
    ]);
    const localIds = await guildMemberIds(guild, (local || []).map((item) => item && item.userId), { fetch: fetchMembers });
    return { profiles: mergeProfiles(global, local, localIds), localIds };
}

function profileChoices(profiles, viewerId, includeSelf = false, localIds = null) {
    const choices = [];
    const seen = new Set();
    for (const profile of profiles || []) {
        if (!profileVisible(profile, viewerId, includeSelf, localIds)) continue;
        const value = snowflake(profile && profile.userId);
        if (!value || seen.has(value)) continue;
        seen.add(value);
        const label = neutralize(profile && profile.nameLabel, 100) || 'Anime profile';
        const choice = { label: label.slice(0, 100), value };
        const description = profileDescription(profile);
        if (description) choice.description = description;
        choices.push(choice);
        if (choices.length >= RESULT_CAP) break;
    }
    return choices;
}

function focusedQuery(interaction) {
    const focused = interaction && interaction.options && typeof interaction.options.getFocused === 'function'
        ? interaction.options.getFocused()
        : '';
    if (typeof focused === 'string') return focused.trim();
    if (focused && typeof focused.value === 'string') return focused.value.trim();
    return '';
}

async function profileAutocomplete(interaction, deps = {}) {
    const now = deps.now || Date.now;
    const guild = interaction && interaction.guild;
    const search = deps.search || (async (text, viewerId) => searchVisibleProfiles(text, {
        guild,
        options: { viewerId, includeSelf: true, namesOnly: true },
        fetchMembers: false,
    }));
    markLatest(interaction);
    const text = focusedQuery(interaction);
    if (text.length < 2 || containsSlur(text)) {
        await safeRespond(interaction, []);
        return;
    }
    await new Promise((resolve) => setTimeout(resolve, deps.coalesceMs ?? 100));
    if (!isCurrent(interaction)) return;
    const budget = remainingBudget(interaction, now);
    const viewerId = interaction && interaction.user && interaction.user.id;
    if (budget <= 0) {
        await safeRespond(interaction, []);
        return;
    }
    let pending;
    try {
        pending = Promise.resolve(search(text, viewerId)).then(
            (results) => ({ results }),
            (error) => {
                noteAutocompleteError(error);
                return { failed: true };
            },
        );
    } catch (error) {
        noteAutocompleteError(error);
        pending = Promise.resolve({ failed: true });
    }
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ timeout: true }), budget);
    });
    try {
        const outcome = await Promise.race([pending, timeout]);
        if (!isCurrent(interaction)) return;
        if (!outcome || outcome.timeout || outcome.failed) {
            await safeRespond(interaction, []);
            return;
        }
        const found = outcome.results;
        const list = Array.isArray(found) ? found : (found && found.profiles) || [];
        const localIds = Array.isArray(found) ? null : found && found.localIds;
        const choices = profileChoices(list, viewerId, true, localIds)
            .map((choice) => ({ name: choice.label, value: choice.value }));
        await safeRespond(interaction, choices);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function deleteProfile(userId) {
    const id = snowflake(userId);
    if (!id) return false;
    await AnimeProfile.deleteOne({ userId: id });
    await PendingRecommendation.deleteMany({
        $or: [{ targetId: id }, { senderId: id }],
    });
    await FullListNotice.deleteMany({
        $or: [{ targetId: id }, { senderId: id }],
    });
    await require('../Models/AnimeFollow').deleteMany({ $or: [{ followerId: id }, { targetId: id }] });
    await require('../Models/AnilistLink').deleteMany({ userId: id });
    return true;
}

module.exports = {
    HIDDEN,
    SETUP_FIRST,
    NOT_SETUP,
    NOT_FOUND,
    QUERY_MAX,
    RESULT_CAP,
    NAME_LIMIT,
    escapeRegex,
    visibilityFor,
    getProfile,
    profileForViewer,
    rememberNames,
    noteIdentity,
    searchProfiles,
    searchVisibleProfiles,
    guildMemberIds,
    isGuildMember,
    profileChoices,
    profileAutocomplete,
    deleteProfile,
};
