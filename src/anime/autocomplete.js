const { redact } = require('../utils/redact');
const { anilistWaitMs, getAnime, peekSearch, searchAnime } = require('./client');
const { displayTitle } = require('./embed');
const { anilistId } = require('./ids');
const { pickTitle } = require('./match');
const { containsSlur, neutralize } = require('./text');

const AUTOCOMPLETE_BUDGET_MS = 2500;
const QUIET_CODES = new Set([10062, 40060]);
const latest = new Map();

function choicesFrom(results) {
    const choices = [];
    const seen = new Set();
    for (const media of results || []) {
        const value = anilistId(media && media.id);
        if (!value || seen.has(value)) continue;
        seen.add(value);
        const name = neutralize(displayTitle(media), 100);
        if (!name) continue;
        choices.push({ name, value });
        if (choices.length >= 25) break;
    }
    return choices;
}

function apiCode(error) {
    if (!error || typeof error !== 'object') return null;
    if (typeof error.code === 'number' && Number.isInteger(error.code)) return error.code;
    if (typeof error.code === 'string' && /^\d+$/.test(error.code)) return Number(error.code);
    const raw = error.rawError && error.rawError.code;
    if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
    const name = typeof error.name === 'string' ? error.name : '';
    const message = typeof error.message === 'string' ? error.message : '';
    const match = /\[(\d+)\]/.exec(name) || /\[(\d+)\]/.exec(message);
    return match ? Number(match[1]) : null;
}

function noteAutocompleteError(error) {
    if (QUIET_CODES.has(apiCode(error))) return false;
    console.error(redact(error));
    return true;
}

function autocompleteKey(interaction) {
    const userId = interaction && interaction.user && interaction.user.id;
    const commandName = interaction && interaction.commandName;
    if (!userId || !commandName) return null;
    return `${userId}:${commandName}`;
}

function markLatest(interaction) {
    const key = autocompleteKey(interaction);
    if (!key) return;
    if (latest.has(key)) latest.delete(key);
    latest.set(key, interaction.id);
    while (latest.size > 500) latest.delete(latest.keys().next().value);
}

function isCurrent(interaction) {
    const key = autocompleteKey(interaction);
    if (!key) return true;
    return latest.get(key) === interaction.id;
}

function resetAutocomplete() {
    latest.clear();
}

function remainingBudget(interaction, now) {
    const created = Number(interaction && interaction.createdTimestamp);
    const elapsed = Number.isFinite(created) ? now() - created : 0;
    return Math.min(AUTOCOMPLETE_BUDGET_MS, Math.max(0, AUTOCOMPLETE_BUDGET_MS - elapsed));
}

async function safeRespond(interaction, choices) {
    if (!isCurrent(interaction)) return;
    if (interaction && interaction.responded) return;
    try {
        await interaction.respond(Array.isArray(choices) ? choices.slice(0, 25) : []);
    } catch (error) {
        noteAutocompleteError(error);
    }
}

// Autocomplete cannot be deferred. A slow Mongo or AniList read answers with
// the fallback once the budget is gone, and 10062 on respond stays quiet.
async function respondWithin(interaction, load, fallback = []) {
    markLatest(interaction);
    const budget = remainingBudget(interaction, Date.now);
    const empty = () => (typeof fallback === 'function' ? fallback() : (Array.isArray(fallback) ? fallback : []));
    if (budget <= 0) {
        await safeRespond(interaction, empty());
        return;
    }
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ timeout: true }), budget);
        if (timer && typeof timer.unref === 'function') timer.unref();
    });
    let pending;
    try {
        pending = Promise.resolve().then(() => load()).then(
            (choices) => ({ choices }),
            (error) => {
                noteAutocompleteError(error);
                return { failed: true };
            },
        );
    } catch (error) {
        noteAutocompleteError(error);
        pending = Promise.resolve({ failed: true });
    }
    try {
        const outcome = await Promise.race([pending, timeout]);
        if (!isCurrent(interaction)) return;
        if (!outcome || outcome.timeout || outcome.failed) {
            await safeRespond(interaction, empty());
            return;
        }
        await safeRespond(interaction, outcome.choices);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function focusedText(interaction) {
    const focused = interaction.options && typeof interaction.options.getFocused === 'function'
        ? interaction.options.getFocused()
        : '';
    return typeof focused === 'string' ? focused.trim() : '';
}

async function animeAutocomplete(interaction, deps = {}) {
    const now = deps.now || Date.now;
    const search = deps.search || searchAnime;
    const peek = deps.peek || peekSearch;
    const waitMs = deps.waitMs || anilistWaitMs;
    markLatest(interaction);

    const text = focusedText(interaction);
    if (text.length < 2 || containsSlur(text)) {
        await safeRespond(interaction, []);
        return;
    }

    let cached = null;
    try {
        cached = await peek(text);
    } catch (error) {
        cached = null;
    }
    if (cached) {
        await safeRespond(interaction, choicesFrom(cached));
        return;
    }

    const budget = remainingBudget(interaction, now);
    let queueWait = 0;
    try {
        queueWait = Number(waitMs()) || 0;
    } catch (error) {
        noteAutocompleteError(error);
    }

    const tracked = trackSearch(search, text, budget);
    if (queueWait > budget) {
        let again = null;
        try {
            again = await peek(text);
        } catch (error) {
            again = null;
        }
        await safeRespond(interaction, choicesFrom(again || []));
        return;
    }

    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ timeout: true }), budget);
    });
    try {
        const outcome = await Promise.race([tracked, timeout]);
        if (!isCurrent(interaction)) return;
        if (outcome.timeout || outcome.failed) {
            let again = null;
            try {
                again = await peek(text);
            } catch (error) {
                again = null;
            }
            await safeRespond(interaction, choicesFrom(again || []));
            return;
        }
        await safeRespond(interaction, choicesFrom(outcome.results));
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function trackSearch(search, text, budget) {
    let pending;
    try {
        pending = search(text, { maxWaitMs: budget });
    } catch (error) {
        noteAutocompleteError(error);
        return Promise.resolve({ failed: true });
    }
    return Promise.resolve(pending).then(
        (results) => ({ results }),
        (error) => {
            noteAutocompleteError(error);
            return { failed: true };
        },
    );
}

async function resolveAnime(raw) {
    if (typeof raw !== 'string' || containsSlur(raw)) return null;
    const direct = anilistId(raw);
    if (direct) {
        const media = await getAnime(direct);
        return media && anilistId(media.id) ? media : null;
    }
    const text = raw.trim();
    if (text.length < 2) return null;
    const results = await searchAnime(text);
    const match = pickTitle(text, results);
    if (!match || !anilistId(match.id)) return null;
    return match;
}

module.exports = {
    AUTOCOMPLETE_BUDGET_MS,
    QUIET_CODES,
    choicesFrom,
    apiCode,
    noteAutocompleteError,
    resetAutocomplete,
    remainingBudget,
    markLatest,
    isCurrent,
    safeRespond,
    respondWithin,
    animeAutocomplete,
    resolveAnime,
};
