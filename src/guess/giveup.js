const { MessageFlags } = require('discord.js');
const { deferComponent, finish } = require('../utils/ack');
const { allowedMentions } = require('../utils/mentions');
const { GIVE_UP_ID } = require('./hints');

function isGiveUpButton(id) { return id === GIVE_UP_ID; }

// Ends the owner's personal round now and reveals the answer, the same way a
// timeout does. No crystals are awarded, and Play again shows when plays remain.
async function handleGiveUp(interaction, client, deps = {}) {
    const reply = (content) => finish(interaction, { content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    const registry = deps.registry || require('./round').registry;
    const round = registry.find(interaction.channelId || interaction.channel?.id, interaction.message?.id);
    if (!round || round.done || round.settled || !round.manual
        || round.guildId !== interaction.guild?.id || interaction.message?.author?.id !== client.user?.id) {
        return reply('This round has already ended. Start a new one with /guess play.');
    }
    if (round.userId !== interaction.user.id) return reply("Only the person playing can give up this round.");
    if (typeof round.forfeit !== 'function') return reply('This round has already ended. Start a new one with /guess play.');
    await deferComponent(interaction);
    await round.forfeit();
    return null;
}

module.exports = { isGiveUpButton, handleGiveUp };
