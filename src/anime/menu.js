const { MessageFlags } = require('discord.js');
const { allowedMentions } = require('../utils/mentions');
const { redact } = require('../utils/redact');

const MENU_TIMEOUT_MS = 120000;
const GENERIC_ERROR = 'There was an error while executing this command!';

function onlyMessage(commandName) {
    return `Only the person who used /${commandName} can use this menu.`;
}

function ephemeral(content) {
    return { content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() };
}

async function replyMenu(interaction, payload) {
    const response = await interaction.reply({
        ...payload,
        allowedMentions: payload.allowedMentions || allowedMentions(),
        withResponse: true,
    });
    const message = response && response.resource && response.resource.message
        ? response.resource.message
        : (typeof interaction.fetchReply === 'function' ? await interaction.fetchReply() : null);
    return message;
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
            const finished = await onCollect(component);
            if (finished) done = true;
        } catch (error) {
            console.error(redact(error));
            const payload = {
                content: GENERIC_ERROR,
                flags: MessageFlags.Ephemeral,
                allowedMentions: allowedMentions(),
            };
            try {
                if (component.replied || component.deferred) await component.followUp(payload);
                else await component.reply(payload);
            } catch (replyError) {
                console.error(redact(replyError));
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
