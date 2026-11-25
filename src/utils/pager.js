const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// The same Previous / Next pair on every paged view.
function pageButtons(prevId, nextId, page, pages, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(prevId)
            .setLabel('Previous')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(Boolean(disabled) || page <= 0),
        new ButtonBuilder()
            .setCustomId(nextId)
            .setLabel('Next')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(Boolean(disabled) || page >= pages - 1),
    );
}

module.exports = { pageButtons };
