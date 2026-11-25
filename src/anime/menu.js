const { MessageFlags } = require('discord.js');
const { replyWithMessage, deferComponent } = require('../utils/ack');
const { allowedMentions } = require('../utils/mentions');
const { isQuietError } = require('../utils/interactionErrors');
const { redact } = require('../utils/redact');

const MENU_TIMEOUT_MS = 120000;
const { GENERIC_ERROR, STALE_EDIT } = require('../utils/messages');

function onlyMessage(commandName) {
    return `Only the person who used /${commandName} can use this menu.`;
}

function ephemeral(content) {
    return { content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() };
}

async function replyMenu(interaction, payload) {
    return replyWithMessage(interaction, {
        ...payload,
        allowedMentions: payload.allowedMentions || allowedMentions(),
    });
}

function watchMenu({ message, interaction, commandName, onCollect, disabledView }) {
    if (!message || typeof message.createMessageComponentCollector !== 'function') return null;
    let done = false;
    const collector = message.createMessageComponentCollector({ time: MENU_TIMEOUT_MS });

    collector.on('collect', async (component) => {
        try {
            if (!component.user || component.user.id !== interaction.user.id) {
                await component.reply({
                    content: onlyMessage(commandName),
                    flags: MessageFlags.Ephemeral,
                    allowedMentions: allowedMentions(),
                });
                return;
            }
            await deferComponent(component);
            const finished = await onCollect(component);
            if (finished) done = true;
        } catch (error) {
            console.error(redact(error));
            const payload = {
                content: error?.name === 'VersionError' ? STALE_EDIT : GENERIC_ERROR,
                flags: MessageFlags.Ephemeral,
                allowedMentions: allowedMentions(),
            };
            try {
                if (component.replied || component.deferred) {
                    await component.followUp(payload);                } else {
                    await component.reply(payload);
                }
            } catch (replyError) {
                if (!isQuietError(replyError)) console.error(redact(replyError));
            }
        }
    });

    collector.on('end', async () => {
        if (done) return;
        try {
            await interaction.editReply(disabledView());
        } catch (error) {
            // The message can already be gone when the collector ends.
        }
    });
    return collector;
}

module.exports = {
    MENU_TIMEOUT_MS,
    onlyMessage,
    ephemeral,
    replyMenu,
    watchMenu,
};
