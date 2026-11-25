const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { embed: styledEmbed, formatNumber } = require('../utils/style');
const { defer, finish } = require('../utils/ack');
const { allowedMentions } = require('../utils/mentions');
const { HINTS } = require('./hints');
const { PACKS } = require('./packs');
const { buyShield, readPlayer } = require('./store');
const { GUESS_SHIELD_COST, GUESS_PACK_COST, GUESS_WAGER_MIN, GUESS_WAGER_MAX, GUESS_GIFT_DAILY_MAX, GUESS_GIFT_MIN_WINS } = require('./constants');

const SHIELD_ID = 'guess:shop:shield';

function isShopButton(id) { return id === SHIELD_ID; }

function shopPayload(player) {
    const hints = ['genre', 'studio', 'screenshot', 'letters'].map((kind) => `${HINTS[kind].emoji} ${HINTS[kind].label} · **${HINTS[kind].cost}** 💎`).join('\n');
    const packs = Object.values(PACKS).map((pack) => `${pack.emoji} ${pack.name}`).join(' · ');
    const embed = styledEmbed({
        title: '💎 Guess shop',
        description: `You have **${formatNumber(player.crystals)}** 💎${player.shields ? ' and a 🛡️ Streak Shield' : ''}.`,
        label: 'guess',
    }).addFields(
        { name: `🛡️ Streak Shield · ${GUESS_SHIELD_COST} 💎`, value: 'Hold one at a time. If you lose or give up a personal round, it is used up and your streak survives.' },
        { name: '💡 Hints (buy during a personal round)', value: `${hints}\nCharacter rounds: ${HINTS.anime.emoji} ${HINTS.anime.label} · **${HINTS.anime.cost}** 💎 and ${HINTS.letters.emoji} Letters.\nEach adds 10 seconds and cuts the reward by 25%.` },
        { name: `📦 Packs · ${GUESS_PACK_COST} 💎 a round`, value: `\`/guess play pack:\`\n${packs}` },
        { name: '🎲 Wagers', value: `\`/guess play wager:\` from ${GUESS_WAGER_MIN} to ${GUESS_WAGER_MAX} 💎. Win and your stake comes back doubled. Lose and it's gone, and your streak ends.` },
        { name: '⚔️ Duels', value: '`/guess duel` a member. Both stake the same amount and the first correct answer takes the pot. Streaks are not affected.' },
        { name: '🎁 Gifts', value: `\`/guess gift\` up to ${GUESS_GIFT_DAILY_MAX} 💎 a day, no fee. You need ${GUESS_GIFT_MIN_WINS} wins first.` },
    );
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(SHIELD_ID)
        .setLabel(player.shields ? 'Shield owned' : `Buy Streak Shield · ${GUESS_SHIELD_COST} 💎`).setEmoji('🛡️')
        .setStyle(ButtonStyle.Primary).setDisabled(Boolean(player.shields)));
    return { embeds: [embed], components: [row], flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() };
}

async function showShop(interaction, deps = {}) {
    await defer(interaction, { ephemeral: true });
    const player = await (deps.readPlayer || readPlayer)(interaction.user.id, interaction.guild.id);
    return finish(interaction, shopPayload(player));
}

// Shop buttons sit on a private message, so only its owner can click them.
async function handleShop(interaction, client, deps = {}) {
    const reply = (content) => finish(interaction, { content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    if (!interaction.guild) return reply('The shop works in servers.');
    await defer(interaction, { ephemeral: true });
    const result = await (deps.buyShield || buyShield)(interaction.user.id, interaction.guild.id);
    if (result.owned) return reply('You already hold a Streak Shield. It is used up the next time your streak would reset.');
    if (!result.ok) return reply(`You need **${result.short}** more 💎 for a Streak Shield.`);
    return reply('🛡️ Streak Shield bought! Your next loss or give up will not reset your streak.');
}

module.exports = { SHIELD_ID, isShopButton, shopPayload, showShop, handleShop };
