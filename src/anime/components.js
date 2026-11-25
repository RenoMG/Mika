const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');
const { displayTitle } = require('./embed');
const { neutralize } = require('./text');

const SEARCH_ID = 'anime:search';
const REROLL_ID = 'anime:reroll';

function optionDescription(media) {
    const bits = [];
    if (media && media.score != null) bits.push(`${media.score}/100`);
    if (media && media.startDate && media.startDate.year) bits.push(String(media.startDate.year));
    const genres = (media && media.genres || []).slice(0, 2).join(', ');
    if (genres) bits.push(genres);
    return (bits.join(' · ') || (media && media.source) || 'Anime').slice(0, 100);
}

function buildSearchRow(results, { disabled = false } = {}) {
    const seen = new Set();
    const options = [];
    for (const media of results || []) {
        const value = media && media.id != null ? String(media.id).slice(0, 100) : '';
        if (!value || seen.has(value)) continue;
        seen.add(value);
        options.push({
            label: (neutralize(displayTitle(media), 100) || 'Anime').slice(0, 100),
            value,
            description: optionDescription(media),
        });
        if (options.length >= 10) break;
    }
    if (!options.length) return [];
    const menu = new StringSelectMenuBuilder()
        .setCustomId(SEARCH_ID)
        .setPlaceholder('Choose an anime')
        .setDisabled(disabled)
        .addOptions(options);
    return [new ActionRowBuilder().addComponents(menu)];
}

function rerollRow(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(REROLL_ID)
            .setEmoji('🎲')
            .setLabel('Reroll')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
    );
}

module.exports = {
    SEARCH_ID,
    REROLL_ID,
    buildSearchRow,
    rerollRow,
};
