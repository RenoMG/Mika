const crypto = require('node:crypto');
const { redact } = require('../utils/redact');
const { autocompleteTimingEnabled, anilistWaitMs, getAnime, peekSearch, searchAnime } = require('./client');
const { displayTitle } = require('./embed');
const { anilistId } = require('./ids');
const { normalizeTitle, pickTitle } = require('./match');
const { containsSlur, neutralize } = require('./text');

const AUTOCOMPLETE_BUDGET_MS = 2500;
const COALESCE_MS = 120;
const MEMORY_TTL_MS = 5000;
const MEMORY_MAX = 64;
const QUIET_CODES = new Set([10062, 40060]);
const latest = new Map();
const memory = new Map();
const userFetches = new Map();
const quietCounts = { 10062: 0, 40060: 0 };
let supersededCount = 0;
let dedupedCount = 0;

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
    const code = apiCode(error);
    if (code === 10062) quietCounts[10062] += 1;
    if (code === 40060) quietCounts[40060] += 1;
    if (QUIET_CODES.has(code)) return false;
    console.error(redact(error));
    return true;
}

function focusedOption(interaction) {
    const getter = interaction && interaction.options && interaction.options.getFocused;
    if (typeof getter !== 'function') return { name: '', value: '' };
    let focused;
    try {
        focused = getter.call(interaction.options, true);
    } catch (error) {
        try {
            focused = getter.call(interaction.options);
        } catch (inner) {
            return { name: '', value: '' };
        }
    }
    if (typeof focused === 'string') return { name: '', value: focused.trim() };
    if (focused && typeof focused === 'object') {
        const name = typeof focused.name === 'string' ? focused.name : '';
        const value = typeof focused.value === 'string' ? focused.value.trim() : '';
        return { name, value };
    }
    return { name: '', value: '' };
}

function autocompleteKey(interaction) {
    const userId = interaction && interaction.user && interaction.user.id;
    const commandName = interaction && interaction.commandName;
    if (!userId || !commandName) return null;
    return `${userId}:${commandName}:${focusedOption(interaction).name}`;
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
    memory.clear();
    userFetches.clear();
}

function remainingBudget(interaction, now) {
    const created = Number(interaction && interaction.createdTimestamp);
    const elapsed = Number.isFinite(created) ? now() - created : 0;
    return Math.min(AUTOCOMPLETE_BUDGET_MS, Math.max(0, AUTOCOMPLETE_BUDGET_MS - elapsed));
}

function rememberChoices(text, choices, now) {
    const key = normalizeTitle(text);
    if (!key || !choices || !choices.length) return;
    if (memory.has(key)) memory.delete(key);
    memory.set(key, { choices: choices.slice(0, 25), expires: now() + MEMORY_TTL_MS });
    while (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
}

function remembered(text, now) {
    const key = normalizeTitle(text);
    if (!key) return null;
    const hit = memory.get(key);
    if (!hit) return null;
    if (hit.expires <= now()) {
        memory.delete(key);
        return null;
    }
    memory.delete(key);
    memory.set(key, hit);
    return hit.choices;
}

function filterToQuery(choices, query) {
    const matched = [];
    for (const choice of choices || []) {
        const name = normalizeTitle(choice && choice.name);
        if (!name) continue;
        if (name.startsWith(query) || query.startsWith(name) || name.includes(query)) matched.push(choice);
        if (matched.length >= 25) break;
    }
    return matched.length ? matched : (choices || []).slice(0, 25);
}

function prefixChoices(text, now) {
    const norm = normalizeTitle(text);
    if (norm.length < 2) return [];
    for (let size = norm.length - 1; size >= 2; size -= 1) {
        const key = norm.slice(0, size);
        const hit = memory.get(key);
        if (!hit) continue;
        if (hit.expires <= now()) {
            memory.delete(key);
            continue;
        }
        return filterToQuery(hit.choices, norm);
    }
    return [];
}

function claimFetch(interaction, queryKey) {
    const key = autocompleteKey(interaction);
    if (!key) return { controller: new AbortController(), queryKey };
    const previous = userFetches.get(key);
    if (previous && previous.queryKey !== queryKey) {
        previous.controller.abort();
        supersededCount += 1;
    }
    if (previous && previous.queryKey === queryKey && !previous.controller.signal.aborted) {
        return previous;
    }
    const record = { controller: new AbortController(), queryKey };
    userFetches.set(key, record);
    while (userFetches.size > 500) userFetches.delete(userFetches.keys().next().value);
    return record;
}

function releaseFetch(interaction, record) {
    const key = autocompleteKey(interaction);
    if (key && userFetches.get(key) === record) userFetches.delete(key);
}

async function safeRespond(interaction, choices) {
    if (!isCurrent(interaction)) return false;
    if (interaction && interaction.responded) return false;
    try {
        await interaction.respond(Array.isArray(choices) ? choices.slice(0, 25) : []);
        return true;
    } catch (error) {
        noteAutocompleteError(error);
        return false;
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function coalesceFor(budget, deps) {
    const configured = deps && Number.isFinite(deps.coalesceMs) ? deps.coalesceMs : COALESCE_MS;
    if (configured <= 0 || budget < 400) return 0;
    return Math.min(configured, Math.max(0, budget - 300));
}

function queryHash(text) {
    return crypto.createHash('sha256').update(normalizeTitle(text)).digest('hex').slice(0, 12);
}

function logTiming(entry) {
    if (!autocompleteTimingEnabled()) return;
    console.debug(JSON.stringify({
        msg: 'autocomplete',
        commandName: entry.commandName || '',
        queryLength: entry.queryLength,
        queryHash: entry.queryHash,
        createdTimestamp: entry.createdTimestamp,
        respondMs: entry.respondMs,
        limiterWaitMs: entry.limiterWaitMs,
        cacheMs: entry.cacheMs,
        cachePhase: entry.cachePhase,
        anilistMs: entry.anilistMs,
        anilistStatus: entry.anilistStatus,
        rateLimitRemaining: entry.rateLimitRemaining,
        kitsuMs: entry.kitsuMs,
        kitsuStatus: entry.kitsuStatus,
        superseded: supersededCount,
        deduped: dedupedCount,
        code10062: quietCounts[10062],
        source: entry.source,
        choiceCount: entry.choiceCount,
    }));
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

async function animeAutocomplete(interaction, deps = {}) {
    const now = deps.now || Date.now;
    const search = deps.search || searchAnime;
    const peek = deps.peek || peekSearch;
    const waitMs = deps.waitMs || anilistWaitMs;
    const startedAt = now();
    markLatest(interaction);
    const focused = focusedOption(interaction);
    const text = focused.value;
    const record = claimFetch(interaction, normalizeTitle(text));
    const trace = {};
    const budget = remainingBudget(interaction, now);
    let source = 'empty';
    let choiceCount = 0;
    let respondMs = null;
    let timer;

    const finishLog = () => {
        const created = Number(interaction && interaction.createdTimestamp);
        logTiming({
            commandName: interaction && interaction.commandName,
            queryLength: text.length,
            queryHash: text.length ? queryHash(text) : '',
            createdTimestamp: Number.isFinite(created) ? created : startedAt,
            respondMs,
            limiterWaitMs: Number.isFinite(trace.limiterWaitMs) ? trace.limiterWaitMs : 0,
            cacheMs: Number.isFinite(trace.cacheMs) ? trace.cacheMs : 0,
            cachePhase: trace.cachePhase || 'miss',
            anilistMs: Number.isFinite(trace.anilistMs) ? trace.anilistMs : null,
            anilistStatus: trace.anilistStatus == null ? null : trace.anilistStatus,
            rateLimitRemaining: trace.rateLimitRemaining == null ? null : trace.rateLimitRemaining,
            kitsuMs: Number.isFinite(trace.kitsuMs) ? trace.kitsuMs : null,
            kitsuStatus: trace.kitsuStatus == null ? null : trace.kitsuStatus,
            source,
            choiceCount,
        });
    };

    const answer = async (choices, nextSource) => {
        source = nextSource;
        choiceCount = Array.isArray(choices) ? choices.length : 0;
        const sent = await safeRespond(interaction, choices);
        if (sent) {
            const created = Number(interaction && interaction.createdTimestamp);
            respondMs = Number.isFinite(created) ? now() - created : now() - startedAt;
        }
        return sent;
    };

    try {
        if (text.length < 2 || containsSlur(text)) {
            await answer([], 'empty');
            return;
        }

        const local = remembered(text, now);
        if (local && local.length) {
            await answer(local, 'cache');
            return;
        }

        if (budget <= 0) {
            const prefix = prefixChoices(text, now);
            await answer(prefix, prefix.length ? 'prefix' : 'empty');
            return;
        }

        const timeout = new Promise((resolve) => {
            timer = setTimeout(() => resolve({ timeout: true }), budget);
        });

        const work = (async () => {
            let cached = null;
            try {
                cached = await peek(text, { trace });
            } catch (error) {
                trace.cachePhase = 'error';
                cached = null;
            }
            if (!trace.cachePhase) {
                trace.cacheMs = 0;
                trace.cachePhase = choicesFrom(cached).length ? 'hit' : 'miss';
            }
            const peeked = choicesFrom(cached);
            if (!peeked.length && trace.cachePhase === 'hit') trace.cachePhase = 'miss';
            if (peeked.length) {
                rememberChoices(text, peeked, now);
                return { choices: peeked, source: 'cache' };
            }

            let queueWait = 0;
            try {
                queueWait = Number(waitMs()) || 0;
            } catch (error) {
                noteAutocompleteError(error);
            }
            trace.limiterWaitMs = queueWait;
            if (queueWait > budget || record.controller.signal.aborted || !isCurrent(interaction)) {
                const prefix = prefixChoices(text, now);
                return { choices: prefix, source: prefix.length ? 'prefix' : 'empty', skip: !isCurrent(interaction) || record.controller.signal.aborted };
            }

            const delay = coalesceFor(budget, deps);
            if (delay > 0) await sleep(delay);
            if (record.controller.signal.aborted || !isCurrent(interaction)) {
                return { choices: [], source: 'empty', skip: true };
            }

            let pending;
            try {
                pending = search(text, {
                    maxWaitMs: budget,
                    budgetMs: budget,
                    signal: record.controller.signal,
                    trace,
                });
            } catch (error) {
                noteAutocompleteError(error);
                pending = Promise.resolve([]);
            }
            const results = await Promise.resolve(pending).then(
                (value) => value,
                (error) => {
                    noteAutocompleteError(error);
                    return [];
                },
            );
            if (trace.deduped) dedupedCount += 1;
            if (record.controller.signal.aborted || !isCurrent(interaction)) {
                return { choices: [], source: 'empty', skip: true };
            }
            const live = choicesFrom(results);
            if (live.length) {
                rememberChoices(text, live, now);
                return { choices: live, source: 'live' };
            }
            const prefix = prefixChoices(text, now);
            return { choices: prefix, source: prefix.length ? 'prefix' : 'empty' };
        })().catch((error) => {
            noteAutocompleteError(error);
            const prefix = prefixChoices(text, now);
            return { choices: prefix, source: prefix.length ? 'prefix' : 'empty' };
        });

        const outcome = await Promise.race([work, timeout]);
        if (!isCurrent(interaction)) return;
        if (!outcome || outcome.timeout) {
            record.controller.abort();
            const prefix = prefixChoices(text, now);
            await answer(prefix, prefix.length ? 'prefix' : 'empty');
            return;
        }
        if (outcome.skip) return;
        await answer(outcome.choices, outcome.source);
    } finally {
        if (timer) clearTimeout(timer);
        releaseFetch(interaction, record);
        finishLog();
    }
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
    MEMORY_MAX,
    MEMORY_TTL_MS,
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
