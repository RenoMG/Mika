const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { embed: styledEmbed } = require('../utils/style');
const { defer, finish } = require('../utils/ack');
const { allowedMentions } = require('../utils/mentions');
const { neutralize } = require('../anime/text');
const { spendCrystals, refundCrystals } = require('./store');
const { crystalReward } = require('./rewards');
const { GUESS_HINT_BONUS_MS } = require('./constants');

const HINTS = Object.freeze({
    genre: { label: 'Genre', cost: 10, emoji: '🎭' },
    studio: { label: 'Studio', cost: 20, emoji: '🎬' },
    screenshot: { label: 'Extra screenshot', cost: 25, emoji: '🖼️' },
});

function hintData(round, kind) {
    if (kind === 'screenshot') return (round.screenshots || []).find((url) =>
        typeof url === 'string' && url.startsWith('https://shikimori.io/') && url !== round.url) || '';
    const values = kind === 'genre' ? round.media?.genres : round.media?.studios;
    return Array.isArray(values) ? values.map((value) => neutralize(value, 80)).filter(Boolean).join(', ').slice(0, 1000) : '';
}

const GIVE_UP_ID = 'guess:giveup';

// Hints, then Give up, on the personal round's prompt. Give up stays usable
// until the round ends, even when every hint is bought or unavailable.
function hintRow(round) {
    const hints = Object.entries(HINTS).map(([kind, hint]) =>
        new ButtonBuilder().setCustomId(`guess:hint:${kind}`).setLabel(`${hint.label} · ${hint.cost} 💎`)
            .setEmoji(hint.emoji).setStyle(ButtonStyle.Secondary)
            .setDisabled(Boolean(round.done || round.purchasedHints?.has(kind) || !hintData(round, kind))));
    const giveUp = new ButtonBuilder().setCustomId(GIVE_UP_ID).setLabel('Give up').setEmoji('🏳️')
        .setStyle(ButtonStyle.Danger).setDisabled(Boolean(round.done || round.settled));
    return new ActionRowBuilder().addComponents(...hints, giveUp);
}

function isHintButton(id) { return typeof id === 'string' && id.startsWith('guess:hint:'); }

async function handleHint(interaction, client, deps = {}) {
    const reply = (content) => finish(interaction, { content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    const kind = /^guess:hint:(genre|studio|screenshot)$/.exec(interaction.customId || '')?.[1];
    const registry = deps.registry || require('./round').registry;
    const round = registry.find(interaction.channelId || interaction.channel?.id, interaction.message?.id);
    if (!kind || !round || round.done || round.settled || !round.manual
        || round.guildId !== interaction.guild?.id || interaction.message?.author?.id !== client.user?.id) {
        return reply('This round has ended. Start a new one with /guess play.');
    }
    if (round.userId !== interaction.user.id) return reply('These hints are for their round. Start your own with /guess play.');
    if (round.hintPending) return reply('Your hint is still loading. Give it a moment.');
    if (round.purchasedHints.has(kind)) return reply('You already bought that hint. Check your private hint above.');
    const data = hintData(round, kind);
    if (!data) return reply('That hint is unavailable for this anime. No crystals were spent.');
    const hint = HINTS[kind];
    // Reserve synchronously. Round settlement waits for this purchase, so a
    // correct answer cannot receive the unreduced reward during a Discord edit.
    const job = Promise.resolve().then(async () => {
        await defer(interaction, { ephemeral: true });
        if (round.done) return reply('This round has ended. No crystals were spent.');
        const paid = await (deps.spend || spendCrystals)(round.userId, round.guildId, hint.cost);
        if (!paid) return reply(`You need **${hint.cost}** 💎 for this hint.`);
        let delivered = false;
        let undoTime;
        try {
            undoTime = round.reserveHintTime();
            if (!undoTime) return await reply('This round has ended. Your crystals are being refunded.');
            const preview = { ...round, purchasedHints: new Set([...round.purchasedHints, kind]) };
            const embed = styledEmbed({
                title: `${hint.emoji} ${hint.label} hint`,
                label: 'guess',
                extra: [`+${GUESS_HINT_BONUS_MS / 1000}s`, `Cost ${hint.cost} 💎`, `Win reward ${crystalReward(preview)} 💎`],
            });
            if (kind === 'screenshot') embed.setImage(data);
            else embed.setDescription(data);
            await finish(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
            delivered = true;
            round.purchasedHints.add(kind);
            try { await interaction.message.edit({ components: [hintRow(round)] }); }
            catch { /* A removed prompt does not undo a delivered private hint. */ }
        } finally {
            if (!delivered) {
                undoTime?.();
                await (deps.refund || refundCrystals)(round.userId, round.guildId, hint.cost);
            }
        }
    });
    round.hintPending = job;
    try { await job; }
    finally { round.hintPending = null; }
}

module.exports = { HINTS, GIVE_UP_ID, hintData, hintRow, isHintButton, handleHint };
