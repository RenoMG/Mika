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
    GUESS_ROUND_MS,
    INTENT_MISSING,
    NO_SCREENSHOT,
    ROUND_BUSY,
    SHIKIMORI_DOWN,
} = require('./constants');
const { guessMatches } = require('./match');
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

function promptPayload(url) {
    return {
        embeds: [new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Guess That Anime')
            .setDescription('Name this anime. You have 30 seconds. The first correct guess wins.')
            .setImage(url)
            .setFooter({ text: 'Mika | 🎌 guess', iconURL: footerIcon() })
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

function timeoutPayload(media) {
    return {
        content: `Time's up. It was ${answerTitle(media)}.`,
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

// The first non-bot message that matches ends the round. Later matches lose.
function claimGuess(state, message, media) {
    if (!state || state.settled) return false;
    if (!message || !message.author) return false;
    if (message.author.bot === true || message.author.system === true) return false;
    if (!guessMatches(message.content, media)) return false;
    const winnerId = snowflake(message.author.id);
    if (!winnerId) return false;
    state.settled = true;
    state.reason = 'win';
    state.winnerId = winnerId;
    return true;
}

function watchChannel(channel, round, hooks = {}) {
    const gate = hooks.locks || locks;
    const award = hooks.award || awardWin;
    const announce = hooks.announce || ((payload) => channel.send(payload));
    const state = { settled: false, reason: '', released: false };
    const safety = setTimeout(() => {
        if (!state.released) {
            state.released = true;
            gate.release(round.channelId);
        }
    }, GUESS_ROUND_MS + 5000);
    if (typeof safety.unref === 'function') safety.unref();

    function release() {
        if (state.released) return;
        state.released = true;
        clearTimeout(safety);
        gate.release(round.channelId);
    }

    if (!channel || typeof channel.createMessageCollector !== 'function') {
        release();
        return state;
    }

    const collector = channel.createMessageCollector({
        time: GUESS_ROUND_MS,
        filter(message) {
            if (!message || !message.author) return false;
            if (message.author.bot === true || message.author.system === true) return false;
            const channelId = message.channelId || (message.channel && message.channel.id);
            return String(channelId || '') === String(round.channelId);
        },
    });

    collector.on('collect', async (message) => {
        if (!claimGuess(state, message, round.media)) return;
        collector.stop('win');
        try {
            await award(message.author.id, round.guildId);
        } catch (error) {
            console.error('Guess award failed.', redact(error));
        }
        try {
            const name = (message.member && message.member.displayName) || message.author.username || 'Someone';
            await announce(winPayload(name, round.media));
        } catch (error) {
            console.error('Guess reveal failed.', redact(error));
        } finally {
            release();
        }
    });

    collector.on('end', async (_collected, reason) => {
        if (reason === 'win' || state.reason === 'win') return;
        if (state.settled) return;
        state.settled = true;
        state.reason = 'timeout';
        try {
            await announce(timeoutPayload(round.media));
        } catch (error) {
            console.error('Guess reveal failed.', redact(error));
        } finally {
            release();
        }
    });

    return state;
}

async function startRound({
    channelId,
    guildId,
    userId,
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
    if (!gate.acquire(channelKey)) return { ok: false, busy: true };

    let consumed = null;
    try {
        if (manual) {
            consumed = await peekAndConsume(userId, guildId, now);
            if (!consumed || !consumed.allowed) {
                gate.release(channelKey);
                return { ok: false, limited: true, nextAt: consumed && consumed.nextAt };
            }
        }
        const chosen = await choose(guildKey);
        if (!chosen || !chosen.ok) {
            gate.release(channelKey);
            if (consumed && consumed.allowed) await refund(userId, guildId, consumed.stamp);
            return {
                ok: false,
                down: Boolean(chosen && chosen.down),
                empty: !(chosen && chosen.down),
                unavailable: Boolean(chosen && chosen.unavailable),
            };
        }
        await send(promptPayload(chosen.url));
        const round = {
            channelId: channelKey,
            guildId: guildKey,
            media: chosen.media,
            url: chosen.url,
            manual: Boolean(manual),
        };
        if (typeof attach === 'function') attach(round);
        return { ok: true, ...round, source: chosen.source };
    } catch (error) {
        gate.release(channelKey);
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
    clientHasMessageContent,
    messageFor,
    claimGuess,
    watchChannel,
    startRound,
};
