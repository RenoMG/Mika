const { Colors, EmbedBuilder, GatewayIntentBits } = require('discord.js');
const { PLACEHOLDER_ICON } = require('../brand');
const { RANDOM_DOWN } = require('../anime/random');
const { displayTitle, animeEmbed } = require('../anime/embed');
const { neutralize } = require('../anime/text');
const { allowedMentions } = require('../utils/mentions');
const { redact } = require('../utils/redact');
const { snowflake } = require('../utils/safeId');
const {
    GUESS_CRYSTALS,
    GUESS_PLAY_LIMIT,
    GUESS_ROUND_MS,
    INTENT_MISSING,
    NO_SCREENSHOT,
    ROUND_BUSY,
    SHIKIMORI_DOWN,
} = require('./constants');
const { guessMatches, createJudge } = require('./match');
const { replayRow } = require('./replay');
const { feedbackText } = require('./feedback');
const { locks } = require('./lock');
const { limitMessage } = require('./plays');
const { chooseRound } = require('./select');
const { awardWin, consumePlay, refundPlay } = require('./store');

function footerIcon() {
    return process.env.MIKAICON || PLACEHOLDER_ICON;
}

function plainName(value) {
    return neutralize(value, 80) || 'Someone';
}

function answerTitle(media) {
    return neutralize(displayTitle(media), 200) || 'Anime';
}

function roundLockKey({ manual = false, userId, channelId } = {}) {
    const channel = snowflake(channelId);
    if (!channel) return '';
    if (manual) {
        const user = snowflake(userId);
        if (!user) return '';
        return `manual:${user}:${channel}`;
    }
    return `auto:${channel}`;
}

function guessesLeftText(remaining) {
    const count = Number(remaining);
    if (count === 1) return '1 guess left this hour';
    if (count === 2) return '2 guesses left this hour';
    return '';
}

function promptPayload(url, options = {}) {
    const manual = Boolean(options.manual);
    const parts = ['Mika | 🎌 guess'];
    const left = manual ? guessesLeftText(options.remaining) : '';
    if (left) parts.push(left);
    const footer = parts.join(' • ');
    const description = manual
        ? 'Name this anime, including its season or movie title. You have 30 seconds. Only you can answer. Reply to the screenshot for feedback on any guess.'
        : 'Name this anime, including its season or movie title. You have 30 seconds. The first correct guess wins. Reply to the screenshot for feedback on any guess.';
    return {
        embeds: [new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Guess That Anime')
            .setDescription(description)
            .setImage(url)
            .setFooter({ text: footer, iconURL: footerIcon() })
            .setTimestamp()],
        allowedMentions: allowedMentions(),
    };
}

function winPayload(name, media) {
    return {
        content: `${plainName(name)} got it. It was ${answerTitle(media)}. +${GUESS_CRYSTALS} crystals.`,
        embeds: [animeEmbed(media)],
        allowedMentions: allowedMentions(),
    };
}

function timeoutPayload(media, round) {
    const title = answerTitle(media);
    const personal = round && round.manual;
    const content = personal
        ? `Time's up, ${plainName(round.ownerName)}. It was ${title}.`
        : `Time's up. It was ${title}.`;
    return {
        content,
        embeds: [animeEmbed(media)],
        allowedMentions: allowedMentions(),
    };
}

function clientHasMessageContent(client) {
    const intents = client && client.options && client.options.intents;
    if (!intents || typeof intents.has !== 'function') return false;
    try {
        return intents.has(GatewayIntentBits.MessageContent) === true;
    } catch (error) {
        return false;
    }
}

function messageFor(result) {
    if (!result) return NO_SCREENSHOT;
    if (result.intent) return INTENT_MISSING;
    if (result.busy) return ROUND_BUSY;
    if (result.limited) return limitMessage(result.nextAt);
    if (result.down) return SHIKIMORI_DOWN;
    if (result.unavailable) return RANDOM_DOWN;
    return NO_SCREENSHOT;
}

function channelOf(message) {
    if (!message) return '';
    return String(message.channelId || (message.channel && message.channel.id) || '');
}

// An explicit reply targets one prompt. Otherwise a correct personal answer
// wins before the auto round; only after checking both do we offer a hint.
function evaluateGuess(rounds, message) {
    if (!message?.author || message.author.bot || message.author.system) return null;
    const userId = snowflake(message.author.id);
    if (!userId) return null;
    const open = (rounds || []).filter((round) => round && !round.done && !round.settled
        && String(round.channelId) === channelOf(message));
    const reference = message.reference?.messageId;
    const targeted = reference ? open.find((round) => round.promptId === reference || round.feedbackIds?.has(reference)) : null;
    if (reference && !targeted) return null; // Ordinary replies are not game entries.
    if (targeted?.manual && String(targeted.userId) !== userId) return null;
    const personal = open.find((round) => round.manual && String(round.userId) === userId);
    const auto = open.find((round) => !round.manual);
    const candidates = targeted ? [targeted] : [personal, auto].filter(Boolean);
    const results = candidates.map((round) => ({ round, ...(round.judge || createJudge(round.media))(message.content) }));
    return results.find((result) => result.kind === 'correct')
        || results.find((result) => result.kind === 'close')
        || (targeted ? results[0] : null);
}
function routeGuess(rounds, message) {
    const result = evaluateGuess(rounds, message);
    return result?.kind === 'correct' ? result.round.key : null;
}

// The first non-bot message that matches ends the round. Later matches lose.
function claimGuess(state, message, media, options = {}) {
    if (!state || state.settled) return false;
    if (!message || !message.author) return false;
    if (message.author.bot === true || message.author.system === true) return false;
    const ownerId = options && options.ownerId ? snowflake(options.ownerId) : '';
    if (ownerId && snowflake(message.author.id) !== ownerId) return false;
    if (!guessMatches(message.content, media)) return false;
    const winnerId = snowflake(message.author.id);
    if (!winnerId) return false;
    state.settled = true;
    state.reason = 'win';
    state.winnerId = winnerId;
    return true;
}

function createRegistry() {
    const hubs = new Map();

    function dropHub(hub) {
        if (!hub || hub.stopped) return;
        hub.stopped = true;
        hubs.delete(hub.channelId);
        if (hub.collector && typeof hub.collector.stop === 'function') {
            try {
                hub.collector.stop('idle');
            } catch (error) {
                // The collector can already be stopped when the last round ends.
            }
        }
    }

    function releaseLock(state) {
        if (!state || state.released) return;
        state.released = true;
        const clearTimer = state.clearTimer || clearTimeout;
        if (state.timer) clearTimer(state.timer);
        if (state.safety) clearTimer(state.safety);
        state.timer = null;
        state.safety = null;
        const gate = (state.hooks && state.hooks.locks) || locks;
        gate.release(state.lockKey || state.channelId);
    }

    async function finish(state, reason, message) {
        if (!state || state.done) return;
        state.done = true;
        state.settled = true;
        state.reason = reason;
        const hub = state.hub;
        if (hub) hub.rounds.delete(state.key);
        const clearTimer = state.clearTimer || clearTimeout;
        if (state.timer) clearTimer(state.timer);
        if (state.safety) clearTimer(state.safety);
        state.timer = null;
        state.safety = null;
        const hooks = state.hooks || {};
        const announce = hooks.announce || ((payload) => state.channel && state.channel.send(payload));
        try {
            if (reason === 'win' && message) {
                const award = hooks.award || awardWin;
                try {
                    await award(message.author.id, state.guildId);
                } catch (error) {
                    console.error('Guess award failed.', redact(error));
                }
                const name = (message.member && message.member.displayName)
                    || (message.author && message.author.username)
                    || state.ownerName
                    || 'Someone';
                try {
                    await announce({ ...winPayload(name, state.media), components: [replayRow(state)] });
                } catch (error) {
                    console.error('Guess reveal failed.', redact(error));
                }
            } else if (reason === 'timeout') {
                try {
                    await announce({ ...timeoutPayload(state.media, state), components: [replayRow(state)] });
                } catch (error) {
                    console.error('Guess reveal failed.', redact(error));
                }
            }
        } finally {
            releaseLock(state);
            if (hub && hub.rounds.size === 0) dropHub(hub);
        }
    }

    async function onCollect(hub, message) {
        // The collector does not need to retain every chat message for its lifetime.
        hub.collector?.collected?.delete(message.id);
        const result = evaluateGuess([...hub.rounds.values()], message);
        if (!result || result.round.done) return null;
        const state = result.round;
        if (result.kind === 'correct') {
            hub.rounds.delete(state.key);
            return finish(state, 'win', message);
        }
        if (typeof message.reply !== 'function') return null;
        const now = (state.hooks.now || Date.now)();
        const previous = state.feedback.get(message.author.id);
        if (state.feedbackCount >= 8 || (previous && now - previous.at < 3000)
            || now - hub.lastFeedback < 1000) return null;
        const text = feedbackText(result.kind === 'wrong' ? 'wrong' : result.hint, previous?.text, state.hooks.random);
        // Reserve before awaiting Discord so simultaneous messages cannot spam.
        state.feedback.set(message.author.id, { at: now, text });
        state.feedbackCount += 1;
        hub.lastFeedback = now;
        try {
            const reply = await message.reply({ content: text, allowedMentions: allowedMentions(), failIfNotExists: false });
            if (reply?.id && !state.done) state.feedbackIds.add(reply.id);
        }
        catch (error) { console.error('Guess feedback failed.', redact(error)); }
        return null;
    }

    function ensureHub(channel, channelId) {
        const id = String(channelId);
        const existing = hubs.get(id);
        if (existing) return existing;
        const hub = { channelId: id, rounds: new Map(), collector: null, stopped: false, lastFeedback: -Infinity };
        if (channel && typeof channel.createMessageCollector === 'function') {
            const collector = channel.createMessageCollector({
                filter(message) {
                    if (!message || !message.author) return false;
                    if (message.author.bot === true || message.author.system === true) return false;
                    return channelOf(message) === id;
                },
            });
            collector.on('collect', (message) => onCollect(hub, message).catch((error) => console.error('Guess message failed.', redact(error))));
            collector.on('end', (_collected, reason) => {
                if (reason === 'win' || reason === 'idle' || hub.stopped) return null;
                const pending = [];
                for (const state of [...hub.rounds.values()]) pending.push(finish(state, 'timeout'));
                return Promise.all(pending);
            });
            hub.collector = collector;
        }
        hubs.set(id, hub);
        return hub;
    }

    function watch(channel, round, hooks = {}) {
        const channelId = snowflake(round && round.channelId) || String((round && round.channelId) || '');
        const lockKey = (round && round.lockKey) || channelId;
        const key = (round && (round.key || round.lockKey)) || roundLockKey({
            manual: round && round.manual,
            userId: round && round.userId,
            channelId,
        }) || lockKey;
        const state = {
            key,
            lockKey,
            channelId,
            guildId: round && round.guildId,
            userId: round && round.manual ? snowflake(round.userId) : '',
            ownerName: round && round.ownerName,
            manual: Boolean(round && round.manual),
            media: round && round.media,
            judge: createJudge(round && round.media),
            promptId: round && round.promptId,
            feedback: new Map(),
            feedbackIds: new Set(),
            feedbackCount: 0,
            channel,
            hooks,
            done: false,
            settled: false,
            released: false,
            timer: null,
            safety: null,
            hub: null,
        };
        const setTimer = hooks.setTimer || setTimeout;
        const clearTimer = hooks.clearTimer || clearTimeout;
        state.clearTimer = clearTimer;
        if (!channel || typeof channel.createMessageCollector !== 'function') {
            releaseLock(state);
            return state;
        }
        const hub = ensureHub(channel, channelId);
        state.hub = hub;
        hub.rounds.set(key, state);
        state.timer = setTimer(() => {
            finish(state, 'timeout');
        }, GUESS_ROUND_MS);
        if (state.timer && typeof state.timer.unref === 'function') state.timer.unref();
        state.safety = setTimer(() => {
            releaseLock(state);
        }, GUESS_ROUND_MS + 5000);
        if (state.safety && typeof state.safety.unref === 'function') state.safety.unref();
        return state;
    }

    function clear() {
        for (const hub of [...hubs.values()]) {
            for (const state of [...hub.rounds.values()]) releaseLock(state);
            dropHub(hub);
        }
        hubs.clear();
    }

    return { watch, clear };
}

const registry = createRegistry();

function watchChannel(channel, round, hooks = {}) {
    const table = (hooks && hooks.registry) || registry;
    return table.watch(channel, round, hooks);
}

function remainingOf(consumed) {
    if (!consumed) return null;
    if (Number.isInteger(consumed.remaining)) return consumed.remaining;
    if (Array.isArray(consumed.plays)) return Math.max(0, GUESS_PLAY_LIMIT - consumed.plays.length);
    return null;
}

async function startRound({
    channelId,
    guildId,
    userId,
    ownerName = '',
    manual = false,
    now = Date.now(),
    locks: gate = locks,
    peekAndConsume = consumePlay,
    refund = refundPlay,
    choose = chooseRound,
    send,
    attach,
    hasContentIntent = true,
} = {}) {
    if (!hasContentIntent) return { ok: false, intent: true };
    const channelKey = snowflake(channelId);
    const guildKey = snowflake(guildId);
    if (!channelKey || !guildKey || typeof send !== 'function') return { ok: false, empty: true };
    if (manual && !snowflake(userId)) return { ok: false, empty: true };
    const lockKey = roundLockKey({ manual, userId, channelId: channelKey });
    if (!lockKey || !gate.acquire(lockKey)) return { ok: false, busy: true };

    let consumed = null;
    try {
        if (manual) {
            consumed = await peekAndConsume(userId, guildId, now);
            if (!consumed || !consumed.allowed) {
                gate.release(lockKey);
                return { ok: false, limited: true, nextAt: consumed && consumed.nextAt };
            }
        }
        const chosen = await choose(guildKey);
        if (!chosen || !chosen.ok) {
            gate.release(lockKey);
            if (consumed && consumed.allowed) await refund(userId, guildId, consumed.stamp);
            return {
                ok: false,
                down: Boolean(chosen && chosen.down),
                empty: !(chosen && chosen.down),
                unavailable: Boolean(chosen && chosen.unavailable),
            };
        }
        const sent = await send(promptPayload(chosen.url, {
            manual: Boolean(manual),
            remaining: manual ? remainingOf(consumed) : null,
        }));
        const round = {
            key: lockKey,
            lockKey,
            channelId: channelKey,
            guildId: guildKey,
            userId: manual ? snowflake(userId) : '',
            ownerName: manual ? String(ownerName || '') : '',
            promptId: sent?.resource?.message?.id || sent?.id || '',
            media: chosen.media,
            url: chosen.url,
            manual: Boolean(manual),
        };
        if (typeof attach === 'function') attach(round);
        return { ok: true, ...round, source: chosen.source };
    } catch (error) {
        gate.release(lockKey);
        if (consumed && consumed.allowed) {
            try {
                await refund(userId, guildId, consumed.stamp);
            } catch (refundError) {
                console.error('Guess play refund failed.', redact(refundError));
            }
        }
        throw error;
    }
}

module.exports = {
    promptPayload,
    winPayload,
    timeoutPayload,
    guessesLeftText,
    roundLockKey,
    routeGuess,
    evaluateGuess,
    createRegistry,
    clientHasMessageContent,
    messageFor,
    claimGuess,
    watchChannel,
    startRound,
};
