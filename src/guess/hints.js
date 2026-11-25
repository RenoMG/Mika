const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { embed: styledEmbed } = require('../utils/style');
const { defer, finish } = require('../utils/ack');
const { allowedMentions } = require('../utils/mentions');
const { neutralize } = require('../anime/text');
const { displayTitle } = require('../anime/embed');
const { spendCrystals, refundCrystals } = require('./store');
const { winTotal } = require('./rewards');
const { GUESS_HINT_BONUS_MS } = require('./constants');

const HINTS = Object.freeze({
    genre: { label: 'Genre', cost: 10, emoji: '🎭' },
    studio: { label: 'Studio', cost: 20, emoji: '🎬' },
    screenshot: { label: 'Extra screenshot', cost: 25, emoji: '🖼️' },
    letters: { label: 'Letters', cost: 30, emoji: '🔤' },
    anime: { label: 'Anime', cost: 20, emoji: '📺' },
});
// Character rounds have no screenshot, genre, or studio to reveal.
const ROUND_HINTS = Object.freeze({
    anime: ['genre', 'studio', 'screenshot', 'letters'],
    character: ['anime', 'letters'],
});
const HINT_PATTERN = /^guess:hint:(genre|studio|screenshot|letters|anime)$/;

function hintsFor(round) {
    return ROUND_HINTS[round?.kind === 'character' ? 'character' : 'anime'];
}

// First letter of each word; every other letter or digit is a blank. Spaces
// and punctuation stay, so the shape of the answer shows.
function letterPattern(text) {
    const value = neutralize(text, 120);
    if (!value) return '';
    return value.split(/\s+/).filter(Boolean).map((word) => {
        let first = true;
        return [...word].map((char) => {
            if (!/[\p{L}\p{N}]/u.test(char)) return char;
            if (first) { first = false; return char; }
            return '_';
        }).join(' ');
    }).join('   ');
}

function answerText(round) {
    if (round?.kind === 'character') return round.character?.name || '';
    const titles = round?.media?.titles || {};
    return titles.english || titles.romaji || titles.native ? displayTitle(round.media) : '';
}

function hintData(round, kind) {
    if (!hintsFor(round).includes(kind)) return '';
    if (kind === 'letters') {
        const pattern = letterPattern(answerText(round));
        return pattern ? `\`\`\`\n${pattern.replace(/`/g, "'")}\n\`\`\`` : '';
    }
    if (kind === 'anime') return neutralize(round.character?.animeTitle, 200) || '';
    if (kind === 'screenshot') return (round.screenshots || []).find((url) =>
        typeof url === 'string' && url.startsWith('https://shikimori.io/') && url !== round.url) || '';
    const values = kind === 'genre' ? round.media?.genres : round.media?.studios;
    return Array.isArray(values) ? values.map((value) => neutralize(value, 80)).filter(Boolean).join(', ').slice(0, 1000) : '';
}

const GIVE_UP_ID = 'guess:giveup';

// Hints, then Give up, on the personal round's prompt. Give up stays usable
// until the round ends, even when every hint is bought or unavailable.
function hintRow(round) {
    const hints = hintsFor(round).map((kind) => [kind, HINTS[kind]]).map(([kind, hint]) =>
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
    const kind = HINT_PATTERN.exec(interaction.customId || '')?.[1];
    const registry = deps.registry || require('./round').registry;
    const round = registry.find(interaction.channelId || interaction.channel?.id, interaction.message?.id);
    if (!kind || !round || round.done || round.settled || !round.manual || round.duel
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
                extra: [`+${GUESS_HINT_BONUS_MS / 1000}s`, `Cost ${hint.cost} 💎`, `Win reward ${winTotal(preview)} 💎`],
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

module.exports = { HINTS, ROUND_HINTS, GIVE_UP_ID, hintData, hintRow, hintsFor, letterPattern, isHintButton, handleHint };
