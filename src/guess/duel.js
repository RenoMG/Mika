const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const crypto = require('node:crypto');
const { embed: styledEmbed } = require('../utils/style');
const { deferComponent, finish } = require('../utils/ack');
const { allowedMentions } = require('../utils/mentions');
const { neutralize } = require('../anime/text');
const { redact } = require('../utils/redact');
const { snowflake } = require('../utils/safeId');
const { GUESS_DUEL_ACCEPT_MS, GUESS_ROUND_MS } = require('./constants');
const { locks } = require('./lock');
const { spendCrystals, refundCrystals } = require('./store');

// A duel: two members, one screenshot, first correct answer takes the pot.
// Stakes are held when the challenge is sent (challenger) and accepted
// (opponent), and returned on decline, expiry, or a round nobody wins.
// Duels never change wins, season wins, or streaks.
const pending = new Map();
const busy = new Set();

function name(value) { return neutralize(value, 80) || 'Someone'; }

function duelButtons(id, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`guess:duel:accept:${id}`).setLabel('Accept').setEmoji('⚔️')
            .setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`guess:duel:decline:${id}`).setLabel('Decline').setEmoji('✖️')
            .setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    );
}

function challengeEmbed(duel, note = '') {
    const stake = duel.stake ? `**${duel.stake}** 💎 each. The winner takes **${duel.stake * 2}** 💎.` : 'A friendly duel, no crystals at stake.';
    return styledEmbed({
        title: '⚔️ Guess That Anime duel',
        description: [
            `**${name(duel.challengerName)}** challenged **${name(duel.opponentName)}**!`,
            stake,
            `One screenshot, ${Math.round(GUESS_ROUND_MS / 1000)} seconds, first correct answer wins. Duels don't affect streaks.`,
            note,
        ].filter(Boolean).join('\n\n'),
        label: 'guess',
    });
}

function isDuelButton(id) { return typeof id === 'string' && id.startsWith('guess:duel:'); }

function release(duel) {
    pending.delete(duel.id);
    busy.delete(duel.challengerId);
    busy.delete(duel.opponentId);
    if (duel.timer) (duel.clearTimer || clearTimeout)(duel.timer);
    duel.timer = null;
}

async function closeChallenge(duel, note) {
    try { await duel.message?.edit?.({ embeds: [challengeEmbed(duel, note)], components: [duelButtons(duel.id, true)], allowedMentions: allowedMentions() }); }
    catch { /* The challenge may have been deleted. */ }
}

// Called from /guess duel after the command has checked both members.
async function createDuel({ interaction, opponent, opponentName, stake, deps = {} }) {
    const guildId = snowflake(interaction.guild?.id);
    const challengerId = snowflake(interaction.user?.id);
    const opponentId = snowflake(opponent?.id);
    const reply = (content) => finish(interaction, { content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    if (!guildId || !challengerId || !opponentId) return reply("I couldn't start that duel.");
    if (busy.has(challengerId)) return reply('You already have a duel waiting or running. Finish that one first.');
    if (busy.has(opponentId)) return reply('They already have a duel waiting or running. Try again in a minute.');
    busy.add(challengerId); busy.add(opponentId);
    if (stake > 0 && !await (deps.spend || spendCrystals)(challengerId, guildId, stake).catch(() => false)) {
        busy.delete(challengerId); busy.delete(opponentId);
        return reply(`You need **${stake}** 💎 to stake that duel.`);
    }
    const duel = {
        id: crypto.randomBytes(6).toString('hex'), guildId, challengerId, opponentId, stake,
        channelId: snowflake(interaction.channelId || interaction.channel?.id),
        challengerName: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
        opponentName, channel: interaction.channel, clearTimer: deps.clearTimer, deps,
    };
    pending.set(duel.id, duel);
    try {
        const sent = await finish(interaction, {
            content: `<@${opponentId}>, you've been challenged!`,
            embeds: [challengeEmbed(duel)],
            components: [duelButtons(duel.id)],
            allowedMentions: { users: [opponentId] },
        });
        duel.message = sent?.resource?.message || sent;
        if (!duel.message?.edit && typeof interaction.fetchReply === 'function') duel.message = await interaction.fetchReply().catch(() => null);
    } catch (error) {
        release(duel);
        if (stake > 0) await (deps.refund || refundCrystals)(challengerId, guildId, stake).catch(() => {});
        throw error;
    }
    duel.timer = (deps.setTimer || setTimeout)(() => {
        if (!pending.has(duel.id)) return;
        release(duel);
        Promise.resolve(stake > 0 ? (deps.refund || refundCrystals)(challengerId, guildId, stake) : null)
            .catch((error) => console.error('Guess duel refund failed.', redact(error)));
        void closeChallenge(duel, '⌛ The challenge expired.' + (stake ? ' The stake was returned.' : ''));
    }, GUESS_DUEL_ACCEPT_MS);
    duel.timer?.unref?.();
    return { ok: true, id: duel.id };
}

async function handleDuel(interaction, client, deps = {}) {
    const reply = (content) => finish(interaction, { content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    const match = /^guess:duel:(accept|decline):([0-9a-f]{12})$/.exec(interaction.customId || '');
    const duel = match && pending.get(match[2]);
    if (!duel || duel.guildId !== interaction.guild?.id) return reply('This duel has ended.');
    const userId = interaction.user?.id;
    const action = match[1];
    if (action === 'decline') {
        if (userId !== duel.opponentId && userId !== duel.challengerId) return reply("This duel isn't yours.");
        release(duel);
        await deferComponent(interaction);
        if (duel.stake) await (duel.deps.refund || refundCrystals)(duel.challengerId, duel.guildId, duel.stake).catch(() => {});
        const who = userId === duel.challengerId ? 'The challenger called it off.' : `**${name(duel.opponentName)}** declined.`;
        return closeChallenge(duel, `✖️ ${who}${duel.stake ? ' The stake was returned.' : ''}`);
    }
    if (userId !== duel.opponentId) return reply('Only the challenged member can accept this duel.');
    if (duel.accepting) return reply('Starting the duel...');
    duel.accepting = true;
    try {
        const roundTools = require('./round');
        if (!roundTools.clientHasMessageContent(client)) return reply(roundTools.messageFor({ intent: true }));
        const lockKey = `duel:${duel.channelId}`;
        const gate = deps.locks || locks;
        if (!gate.acquire(lockKey)) return reply('Another duel is running in this channel. Accept again in a moment.');
        let held = true;
        let charged = false;
        try {
            if (duel.stake && !await (duel.deps.spend || spendCrystals)(duel.opponentId, duel.guildId, duel.stake).catch(() => false)) {
                return reply(`You need **${duel.stake}** 💎 to accept this duel.`);
            }
            charged = Boolean(duel.stake);
            release(duel);
            await deferComponent(interaction);
            const chosen = await (deps.choose || require('./select').chooseRound)(duel.guildId, { userId: duel.challengerId }).catch(() => null);
            if (!chosen?.ok) {
                await closeChallenge(duel, `${roundTools.messageFor(chosen)} Stakes were returned.`);
                return null;
            }
            await closeChallenge(duel, '✅ Accepted! The round is below.');
            const prompt = await duel.channel.send({
                content: `<@${duel.challengerId}> ⚔️ <@${duel.opponentId}>`,
                embeds: [styledEmbed({
                    title: '⚔️ Duel: Guess That Anime',
                    description: [
                        'Name this anime, including its **season or movie title**.',
                        `⏱️ **${Math.round(GUESS_ROUND_MS / 1000)} seconds**. Only the two duelists can answer. First correct guess wins${duel.stake ? ` **${duel.stake * 2}** 💎` : ''}!`,
                    ].join('\n\n'),
                    label: 'guess',
                }).setImage(chosen.url)],
                allowedMentions: { users: [duel.challengerId, duel.opponentId] },
            });
            (deps.watch || roundTools.watchChannel)(duel.channel, {
                key: lockKey, lockKey, channelId: duel.channelId, guildId: duel.guildId,
                promptId: prompt?.id || '', promptMessage: prompt, media: chosen.media, url: chosen.url,
                screenshots: chosen.screenshots || [], manual: false,
                duel: { players: [duel.challengerId, duel.opponentId], stake: duel.stake },
            }, deps.hooks || {});
            held = false; // The round owns the lock and the stakes now.
            charged = false;
            return null;
        } finally {
            if (held) {
                gate.release(lockKey);
                if (!pending.has(duel.id) && duel.stake) {
                    // The round never started: return both stakes.
                    await (duel.deps.refund || refundCrystals)(duel.challengerId, duel.guildId, duel.stake).catch(() => {});
                    if (charged) await (duel.deps.refund || refundCrystals)(duel.opponentId, duel.guildId, duel.stake).catch(() => {});
                }
            }
        }
    } finally {
        duel.accepting = false;
    }
}

function resetDuels() {
    for (const duel of [...pending.values()]) release(duel);
    busy.clear();
}

module.exports = { createDuel, handleDuel, isDuelButton, duelButtons, resetDuels, pending };
