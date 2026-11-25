const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { embed: styledEmbed, formatNumber, timestamp } = require('../utils/style');
const { defer, deferComponent, finish, updateComponent } = require('../utils/ack');
const { allowedMentions } = require('../utils/mentions');
const { ITEMS, BOOSTS, itemOf } = require('./items');
const { crystalMultiplier } = require('./rewards');
const { activateBoost, buyItem, readPlayer } = require('./store');

// The shop sells items you hold; /guess inventory shows them and starts
// boosts. Both are private menus, so only their owner can press the buttons.
const SHOP_PREFIX = 'guess:shop:';
const USE_PREFIX = 'guess:inv:';

function isShopButton(id) { return typeof id === 'string' && (id.startsWith(SHOP_PREFIX) || id.startsWith(USE_PREFIX)); }

function heldOf(player, id) {
    return id === 'shield' ? player.shields : (player.boosts?.[id] || 0);
}

function private_(payload) {
    return { ...payload, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() };
}

function shopPayload(player, note = '') {
    const embed = styledEmbed({
        title: '🛒 Guess shop',
        description: `You have **${formatNumber(player.crystals)}** 💎. Items go to \`/guess inventory\`.`,
        label: 'guess',
    }).addFields(Object.entries(ITEMS).map(([id, item]) => ({
        name: `${item.emoji} ${item.name} · ${item.cost} 💎`,
        value: `${item.text}\n-# You have ${heldOf(player, id)}/${item.max}`,
    })));
    const row = new ActionRowBuilder().addComponents(Object.entries(ITEMS).map(([id, item]) => new ButtonBuilder()
        .setCustomId(`${SHOP_PREFIX}${id}`).setLabel(`Buy ${item.short}`).setEmoji(item.emoji)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(heldOf(player, id) >= item.max || player.crystals < item.cost)));
    return private_({ content: note, embeds: [embed], components: [row] });
}

function boostLine(player) {
    if (!player.boost) return 'No boost running.';
    return `⚡ Double crystals until ${timestamp(player.boost.until, 't')} (${timestamp(player.boost.until, 'R')}) · **${player.boost.rounds}** ${player.boost.rounds === 1 ? 'round' : 'rounds'} left`;
}

function inventoryPayload(player, note = '') {
    const embed = styledEmbed({
        title: '🎒 Your inventory',
        description: `**${formatNumber(player.crystals)}** 💎\n${boostLine(player)}`,
        label: 'guess',
    }).addFields(Object.entries(ITEMS).map(([id, item]) => ({
        name: `${item.emoji} ${item.name}`,
        value: `**${heldOf(player, id)}**/${item.max}${id === 'shield' ? ' · used automatically' : ''}`,
        inline: true,
    })));
    const row = new ActionRowBuilder().addComponents(BOOSTS.map((id) => new ButtonBuilder()
        .setCustomId(`${USE_PREFIX}${id}`).setLabel(`Start ${ITEMS[id].short} boost`).setEmoji(ITEMS[id].emoji)
        .setStyle(ButtonStyle.Success).setDisabled(!heldOf(player, id) || Boolean(player.boost))));
    const empty = !player.shields && BOOSTS.every((id) => !heldOf(player, id));
    const hint = empty ? 'Nothing here yet. Buy items with `/guess shop`.' : '';
    return private_({ content: [note, hint].filter(Boolean).join('\n'), embeds: [embed], components: [row] });
}

async function showShop(interaction, deps = {}) {
    await defer(interaction, { ephemeral: true });
    const player = await (deps.readPlayer || readPlayer)(interaction.user.id, interaction.guild.id);
    return finish(interaction, shopPayload(player));
}

async function showInventory(interaction, deps = {}) {
    await defer(interaction, { ephemeral: true });
    const player = await (deps.readPlayer || readPlayer)(interaction.user.id, interaction.guild.id);
    return finish(interaction, inventoryPayload(player));
}

async function buy(interaction, id, deps) {
    const result = await (deps.buyItem || buyItem)(interaction.user.id, interaction.guild.id, id);
    const item = itemOf(id);
    if (result.ok) return `${item.emoji} Bought a **${item.name}**!${id === 'shield' ? '' : ' Start it from `/guess inventory`.'}`;
    if (result.full) return `You already hold the most ${item.name}s you can (${item.max}).`;
    return `You need **${result.short}** more 💎 for a ${item.name}.`;
}

async function use(interaction, id, deps) {
    const now = (deps.now || Date.now)();
    if (crystalMultiplier(true, now) === 2) return "It's the weekend, so crystals are already doubled. Save your boost for a weekday.";
    const result = await (deps.activateBoost || activateBoost)(interaction.user.id, interaction.guild.id, id, now);
    const item = itemOf(id);
    if (result.ok) return `${item.emoji} **${item.name}** started! Ends ${timestamp(result.until, 'R')}.`;
    if (result.running) return `A boost is already running. It ends ${timestamp(result.until, 'R')}.`;
    return `You don't have a ${item.name}. Buy one with \`/guess shop\`.`;
}

async function handleShop(interaction, client, deps = {}) {
    const id = interaction.customId || '';
    const shop = id.startsWith(SHOP_PREFIX);
    const itemId = id.slice((shop ? SHOP_PREFIX : USE_PREFIX).length);
    if (!interaction.guild || !itemOf(itemId) || (!shop && !BOOSTS.includes(itemId))) {
        return finish(interaction, private_({ content: 'This menu has expired. Open it again.' }));
    }
    await deferComponent(interaction);
    const note = shop ? await buy(interaction, itemId, deps) : await use(interaction, itemId, deps);
    const player = await (deps.readPlayer || readPlayer)(interaction.user.id, interaction.guild.id);
    return updateComponent(interaction, shop ? shopPayload(player, note) : inventoryPayload(player, note));
}

module.exports = { isShopButton, shopPayload, inventoryPayload, showShop, showInventory, handleShop };
