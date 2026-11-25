const { GatewayIntentBits } = require('discord.js');
const { embed: styledEmbed } = require('../utils/style');
const { RANDOM_DOWN } = require('../anime/random');
const { displayTitle, animeEmbed } = require('../anime/embed');
const { neutralize } = require('../anime/text');
const { allowedMentions } = require('../utils/mentions');
const { redact } = require('../utils/redact');
const { snowflake } = require('../utils/safeId');
const {
    GUESS_PLAY_LIMIT,
    GUESS_ROUND_MS,
    GUESS_HINT_BONUS_MS,
    INTENT_MISSING,
    NO_SCREENSHOT,
    NO_VARIETY,
    ROUND_BUSY,
    SHIKIMORI_DOWN,
} = require('./constants');
const { guessMatches, createJudge } = require('./match');
const { replayRow } = require('./replay');
const { hintRow } = require('./hints');
const { crystalMultiplier, rewardLabel, wagerStake, winTotal } = require('./rewards');
const { createCharacterJudge } = require('./characters');
const { unlockText } = require('./achievements');
const { GUESS_FAST_WIN_MS } = require('./constants');
const { feedbackText } = require('./feedback');
const { locks } = require('./lock');
const { limitMessage } = require('./plays');
const { chooseRound } = require('./select');
const { awardWin, consumePlay, endStreak, refundPlay, spendCrystals, refundCrystals, settleDuel, unlockAchievements } = require('./store');

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
    if (remaining == null) return '';
    const count = Number(remaining);
    if (count === 0) return 'Last round this hour';
    if (count === 1) return '1 round left this hour';
    if (count === 2) return '2 rounds left this hour';
    return '';
}

function promptPayload(url, options = {}) {
    const manual = Boolean(options.manual);
    const character = options.kind === 'character';
    const left = manual ? guessesLeftText(options.remaining) : '';
    const seconds = Math.round(GUESS_ROUND_MS / 1000);
    const bonus = Math.round(GUESS_HINT_BONUS_MS / 1000);
    const description = [
        character ? 'Name this **character**. Their first or last name is enough.'
            : 'Name this anime, including its **season or movie title**.',
        manual ? `⏱️ You have **${seconds} seconds**. Only you can answer. Stuck? Press **Give up** to see the answer.`
            : `⏱️ You have **${seconds} seconds**. The first correct guess wins!`,
        '💬 Reply to the screenshot to get feedback on a guess.',
    ];
    if (manual) description.push(
        `💡 **Need a hint?** Hints are private and cost 💎 crystals. Each one adds **${bonus} seconds** and lowers your win reward by **25%**.`,
        `🏆 **Reward:** ${rewardLabel(options)}`,
    );
    if (manual && options.pack) description.push(`${options.pack.emoji} **Pack:** ${options.pack.name}`);
    if (manual && wagerStake(options)) description.push(`🎲 **Wager:** ${wagerStake(options)} 💎. Lose and it's gone, and your streak ends.`);
    return {
        embeds: [styledEmbed({
            title: character ? '🎭 Guess That Character' : '🎯 Guess That Anime',
            description: description.join('\n\n'),
            label: 'guess',
            extra: [left],
        }).setImage(url)],
        allowedMentions: allowedMentions(),
    };
}

function streakText(streak) {
    const count = Math.floor(Number(streak));
    return Number.isFinite(count) && count >= 2 ? ` 🔥 **${count} in a row!**` : '';
}

function answerOf(round = {}, media = round.media) {
    if (round.kind === 'character') return neutralize(round.character?.name, 200) || 'Character';
    return answerTitle(media);
}

function lines(...parts) {
    return parts.filter(Boolean).join('\n');
}

function winPayload(name, media, round = {}, streak = 0, extra = {}) {
    const stake = wagerStake(round);
    return {
        content: lines(
            `🎉 **${plainName(name)}** got it! It was **${answerOf(round, media)}**. **+${winTotal(round)}** 💎${streakText(streak)}`,
            stake ? `🎲 Wager won: your **${stake}** 💎 came back doubled.` : '',
            unlockText(extra.unlocked),
        ),
        embeds: [revealEmbed(media, round)],
        allowedMentions: allowedMentions(),
    };
}

function characterEmbed(character = {}) {
    const embed = styledEmbed({
        title: `🎭 ${neutralize(character.name, 200) || 'Character'}`,
        description: [character.native ? neutralize(character.native, 120) : '',
            character.animeTitle ? `From **${neutralize(character.animeTitle, 200)}**` : ''].filter(Boolean).join('\n'),
        label: 'guess',
    });
    if (typeof character.image === 'string') embed.setThumbnail(character.image);
    if (typeof character.url === 'string' && character.url.startsWith('https://anilist.co/')) embed.setURL(character.url);
    return embed;
}

function revealEmbed(media, round = {}) {
    const embed = round.kind === 'character' ? characterEmbed(round.character) : animeEmbed(media);
    if (round.crystalMultiplier === 2) embed.addFields({ name: '💎 Weekend bonus', value: 'Double crystals all weekend (Pacific time).' });
    return embed;
}

function lossLines(round = {}, extra = {}) {
    const stake = wagerStake(round);
    return [
        stake ? `💸 The **${stake}** 💎 wager is gone.` : '',
        extra.shielded ? `🛡️ Your Streak Shield saved your 🔥 **${extra.streak}** streak!` : '',
    ];
}

function timeoutPayload(media, round, extra = {}) {
    const title = answerOf(round || {}, media);
    const personal = round && round.manual;
    let content = personal
        ? `⏰ Time's up, **${plainName(round.ownerName)}**! It was **${title}**.`
        : `⏰ Time's up! It was **${title}**.`;
    if (round?.duel) content = `⏰ Time's up! Nobody got it. It was **${title}**.${round.duel.stake ? ' Both stakes were returned.' : ''}`;
    return {
        content: lines(content, ...lossLines(round, extra)),
        embeds: [revealEmbed(media, round)],
        allowedMentions: allowedMentions(),
    };
}

function giveUpPayload(media, round, extra = {}) {
    return {
        content: lines(`🏳️ **${plainName(round && round.ownerName)}** gave up. It was **${answerOf(round || {}, media)}**.`,
            ...lossLines(round, extra)),
        embeds: [revealEmbed(media, round)],
        allowedMentions: allowedMentions(),
    };
}

function duelWinPayload(name, media, round = {}) {
    const pot = round.duel?.stake ? round.duel.stake * 2 : 0;
    return {
        content: `⚔️ **${plainName(name)}** wins the duel! It was **${answerOf(round, media)}**.${pot ? ` **+${pot}** 💎` : ''}`,
        embeds: [revealEmbed(media, round)],
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
    if (result.broke) return `You need **${result.needed}** 💎 for that round. Win a few rounds first, or lower the wager. This didn't use a play.`;
    if (result.variety) return NO_VARIETY;
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
    if (targeted?.duel && !targeted.duel.players.includes(userId)) return null;
    const personal = open.find((round) => round.manual && String(round.userId) === userId);
    const duel = open.find((round) => round.duel && round.duel.players.includes(userId));
    const auto = open.find((round) => !round.manual && !round.duel);
    const candidates = targeted ? [targeted] : [personal, duel, auto].filter(Boolean);
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
        // Play again is only for personal rounds with plays left. An auto-drop is
        // the one round the server scheduled, so it never offers another.
        const components = state.manual && state.remaining !== 0 ? [replayRow(state)] : [];
        try {
            await state.hintPending?.catch(() => {});
            if (state.manual && state.promptMessage?.edit) {
                try { await state.promptMessage.edit({ components: [hintRow(state)] }); }
                catch { /* The prompt may have been deleted. */ }
            }
            const name = message && ((message.member && message.member.displayName)
                || (message.author && message.author.username)
                || state.ownerName
                || 'Someone');
            if (reason === 'win' && message && state.duel) {
                const winnerId = snowflake(message.author.id);
                const loserId = state.duel.players.find((id) => id !== winnerId);
                try { await (hooks.settleDuel || settleDuel)(winnerId, loserId, state.guildId, state.duel.stake * 2); }
                catch (error) { console.error('Guess duel payout failed.', redact(error)); }
                const unlock = hooks.unlock || (hooks.settleDuel ? null : unlockAchievements);
                const unlocked = unlock ? await Promise.resolve().then(() => unlock(winnerId, state.guildId)).catch(() => []) : [];
                try {
                    const payload = duelWinPayload(name, state.media, state);
                    if (unlocked?.length) payload.content = lines(payload.content, unlockText(unlocked));
                    await announce(payload);
                } catch (error) { console.error('Guess reveal failed.', redact(error)); }
            } else if (reason === 'win' && message) {
                const award = hooks.award || awardWin;
                let streak = 0;
                let unlocked = [];
                const elapsed = (state.hooks.now || Date.now)() - (state.startedAt || 0);
                const stake = wagerStake(state);
                const counters = {
                    noHintWins: state.manual && !state.purchasedHints.size ? 1 : 0,
                    fastWins: elapsed >= 0 && elapsed < GUESS_FAST_WIN_MS ? 1 : 0,
                    wagerWins: stake ? 1 : 0,
                    bigWagerWins: stake >= 250 ? 1 : 0,
                    characterWins: state.kind === 'character' ? 1 : 0,
                };
                try {
                    const saved = await award(message.author.id, state.guildId, winTotal(state),
                        { streak: state.manual, counters, pack: state.manual ? state.pack?.id : undefined });
                    if (state.manual) streak = Number(saved && saved.streak) || 0;
                    // Injected awards (tests, tools) skip the real achievement check unless one is given.
                    const unlock = hooks.unlock || (hooks.award ? null : unlockAchievements);
                    if (unlock) unlocked = await Promise.resolve().then(() => unlock(message.author.id, state.guildId)).catch(() => []);
                } catch (error) {
                    console.error('Guess award failed.', redact(error));
                }
                try {
                    await announce({ ...winPayload(name, state.media, state, streak, { unlocked }), components });
                } catch (error) {
                    console.error('Guess reveal failed.', redact(error));
                }
            } else if ((reason === 'timeout' || reason === 'giveup') && state.duel) {
                if (state.duel.stake) {
                    for (const id of state.duel.players) {
                        try { await (hooks.refundCrystals || refundCrystals)(id, state.guildId, state.duel.stake); }
                        catch (error) { console.error('Guess duel refund failed.', redact(error)); }
                    }
                }
                try { await announce(timeoutPayload(state.media, state)); }
                catch (error) { console.error('Guess reveal failed.', redact(error)); }
            } else if (reason === 'timeout' || reason === 'giveup') {
                let extra = {};
                if (state.manual && state.userId) {
                    try {
                        extra = await (hooks.endStreak || endStreak)(state.userId, state.guildId, { gaveUp: reason === 'giveup' }) || {};
                        const unlock = hooks.unlock || (hooks.endStreak ? null : unlockAchievements);
                        if (extra.shielded && unlock) await Promise.resolve().then(() => unlock(state.userId, state.guildId)).catch(() => []);
                    } catch (error) {
                        console.error('Guess streak update failed.', redact(error));
                    }
                }
                const payload = reason === 'giveup' ? giveUpPayload(state.media, state, extra) : timeoutPayload(state.media, state, extra);
                try {
                    await announce({ ...payload, components });
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
            remaining: round && round.remaining,
            kind: round?.kind === 'character' ? 'character' : 'anime',
            character: round?.character || null,
            wager: wagerStake(round || {}),
            pack: round?.pack || null,
            duel: round?.duel ? { players: round.duel.players.map(String), stake: Math.max(0, Number(round.duel.stake) || 0) } : null,
            media: round && round.media,
            judge: round?.kind === 'character' ? createCharacterJudge(round.character) : createJudge(round && round.media),
            promptId: round && round.promptId,
            promptMessage: round && round.promptMessage,
            url: round && round.url,
            screenshots: round?.screenshots || [],
            crystalMultiplier: round?.crystalMultiplier || 1,
            purchasedHints: new Set(),
            hintPending: null,
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
        const now = hooks.now || Date.now;
        state.clearTimer = clearTimer;
        if (!channel || typeof channel.createMessageCollector !== 'function') {
            releaseLock(state);
            return state;
        }
        const hub = ensureHub(channel, channelId);
        state.hub = hub;
        hub.rounds.set(key, state);
        state.startedAt = now();
        state.deadlineAt = now() + GUESS_ROUND_MS;
        let timerVersion = 0;
        function scheduleDeadline() {
            if (state.timer) clearTimer(state.timer);
            if (state.safety) clearTimer(state.safety);
            const version = ++timerVersion;
            const remaining = Math.max(0, state.deadlineAt - now());
            state.timer = setTimer(() => {
                if (version === timerVersion && !state.released) return finish(state, 'timeout');
            }, remaining);
            state.timer?.unref?.();
            state.safety = setTimer(() => {
                if (version === timerVersion) releaseLock(state);
            }, remaining + 5000);
            state.safety?.unref?.();
        }
        // Reserve time before delivering a paid hint so the original timeout
        // cannot interrupt delivery. Failed delivery rolls back this extension.
        state.reserveHintTime = () => {
            if (!state.manual || state.done || state.settled || state.released || now() >= state.deadlineAt) return null;
            state.deadlineAt += GUESS_HINT_BONUS_MS;
            scheduleDeadline();
            let undone = false;
            return () => {
                if (undone) return;
                undone = true;
                state.deadlineAt -= GUESS_HINT_BONUS_MS;
                if (!state.done && !state.released) scheduleDeadline();
            };
        };
        // Give up: only the owner's personal round, and only while it is still open.
        state.forfeit = async () => {
            if (!state.manual || state.done || state.settled) return false;
            state.settled = true;
            hub.rounds.delete(state.key);
            await finish(state, 'giveup');
            return true;
        };
        scheduleDeadline();
        return state;
    }

    function clear() {
        for (const hub of [...hubs.values()]) {
            for (const state of [...hub.rounds.values()]) releaseLock(state);
            dropHub(hub);
        }
        hubs.clear();
    }

    function find(channelId, promptId) {
        if (!promptId) return null;
        return [...(hubs.get(String(channelId))?.rounds.values() || [])].find((state) => state.promptId === promptId) || null;
    }

    return { watch, clear, find };
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
    chooseCharacter: pickCharacter = null,
    kind = 'anime',
    pack = null,
    wager = 0,
    packCost = 0,
    spend = spendCrystals,
    refundGems = refundCrystals,
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
    // Wagers, packs and character rounds are personal-round options only.
    const character = manual && kind === 'character';
    const stake = manual && Number.isSafeInteger(wager) && wager > 0 ? wager : 0;
    const fee = manual && pack && Number.isSafeInteger(packCost) && packCost > 0 ? packCost : 0;
    let paid = 0;
    const refundPaid = async () => {
        if (!paid) return;
        const amount = paid;
        paid = 0;
        try { await refundGems(userId, guildId, amount); }
        catch (error) { console.error('Guess crystal refund failed.', redact(error)); }
    };
    try {
        if (manual) {
            consumed = await peekAndConsume(userId, guildId, now);
            if (!consumed || !consumed.allowed) {
                gate.release(lockKey);
                return { ok: false, limited: true, nextAt: consumed && consumed.nextAt };
            }
        }
        if (stake + fee > 0) {
            if (!await spend(userId, guildId, stake + fee)) {
                gate.release(lockKey);
                await refund(userId, guildId, consumed.stamp);
                return { ok: false, broke: true, needed: stake + fee };
            }
            paid = stake + fee;
        }
        const chosen = character
            ? await (pickCharacter || require('./characters').chooseCharacter)(guildKey, { userId })
            : await choose(guildKey, { userId: manual ? userId : undefined, pack: manual ? pack : undefined });
        if (!chosen || !chosen.ok) {
            gate.release(lockKey);
            await refundPaid();
            if (consumed && consumed.allowed) await refund(userId, guildId, consumed.stamp);
            return {
                ok: false,
                variety: Boolean(chosen && chosen.variety),
                down: Boolean(chosen && chosen.down),
                empty: !(chosen && chosen.down),
                unavailable: Boolean(chosen && chosen.unavailable),
            };
        }
        const remaining = manual ? remainingOf(consumed) : null;
        const multiplier = crystalMultiplier(manual, now);
        const roundKind = character ? 'character' : 'anime';
        const payload = promptPayload(chosen.url, { manual: Boolean(manual), remaining, crystalMultiplier: multiplier,
            kind: roundKind, wager: stake, pack: fee ? pack : null });
        if (manual) payload.components = [hintRow({ kind: roundKind, character: chosen.character, media: chosen.media, url: chosen.url, screenshots: chosen.screenshots })];
        const sent = await send(payload);
        paid = 0; // The round is live: the wager now rides on it, and the pack fee is spent.
        const round = {
            key: lockKey,
            lockKey,
            channelId: channelKey,
            guildId: guildKey,
            userId: manual ? snowflake(userId) : '',
            ownerName: manual ? String(ownerName || '') : '',
            promptId: sent?.resource?.message?.id || sent?.id || '',
            promptMessage: sent?.resource?.message || sent,
            screenshots: chosen.screenshots || [],
            crystalMultiplier: multiplier,
            media: chosen.media,
            url: chosen.url,
            manual: Boolean(manual),
            remaining,
            kind: roundKind,
            character: chosen.character || null,
            wager: stake,
            pack: fee ? pack : null,
        };
        if (typeof attach === 'function') attach(round);
        return { ok: true, ...round, source: chosen.source };
    } catch (error) {
        gate.release(lockKey);
        await refundPaid();
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
    registry,
    promptPayload,
    winPayload,
    timeoutPayload,
    giveUpPayload,
    duelWinPayload,
    characterEmbed,
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
