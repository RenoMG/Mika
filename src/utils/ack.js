const { MessageFlags } = require('discord.js');
const { allowedMentions } = require('./mentions');
const { isQuietError } = require('./interactionErrors');

function flagBits(flags) {
    if (flags == null) return 0;
    if (typeof flags === 'number') return flags;
    if (typeof flags === 'bigint') return Number(flags);
    if (typeof flags.bitfield === 'number') return flags.bitfield;
    if (typeof flags.bitfield === 'bigint') return Number(flags.bitfield);
    return 0;
}

function isEphemeral(payload) {
    if (!payload || typeof payload !== 'object') return false;
    return (flagBits(payload.flags) & MessageFlags.Ephemeral) === MessageFlags.Ephemeral;
}

function prepared(payload) {
    if (typeof payload === 'string') {
        return { content: payload, allowedMentions: allowedMentions() };
    }
    const body = payload && typeof payload === 'object' ? { ...payload } : {};
    if (!body.allowedMentions) body.allowedMentions = allowedMentions();
    return body;
}

// Ephemeral is fixed when the interaction is deferred. editReply cannot add it,
// and withResponse belongs to the initial reply.
function withoutAckFlags(body) {
    const next = { ...body };
    delete next.flags;
    delete next.withResponse;
    return next;
}

// Acknowledge before any network or database work. A test double that only
// implements reply() is left alone so it still receives that reply.
async function defer(interaction, { ephemeral = false } = {}) {
    if (!interaction || interaction.deferred || interaction.replied) return false;
    if (typeof interaction.deferReply !== 'function') return false;
    const options = ephemeral ? { flags: MessageFlags.Ephemeral } : undefined;
    await interaction.deferReply(options);
    interaction.deferred = true;
    if (ephemeral) interaction.ephemeral = true;
    return true;
}

function messageFrom(response) {
    if (!response || typeof response !== 'object') return null;
    if (response.resource && response.resource.message) return response.resource.message;
    if (typeof response.createMessageComponentCollector === 'function') return response;
    return null;
}

// Public prompts edit the deferred reply. A private message after a public
// defer cannot be edited into place, so it is a follow-up and the thinking
// placeholder is removed. An ephemeral defer stays private through editReply.
async function finish(interaction, payload) {
    const body = prepared(payload);
    const acked = Boolean(interaction && (interaction.deferred || interaction.replied));
    if (!acked || typeof interaction.editReply !== 'function') {
        return interaction.reply(body);
    }
    if (isEphemeral(body) && interaction.ephemeral !== true) {
        if (typeof interaction.deleteReply === 'function') {
            try {
                await interaction.deleteReply();
            } catch (error) {
                if (!isQuietError(error)) {
                    // The placeholder can already be gone. The private follow-up still has to land.
                }
            }
        }
        if (typeof interaction.followUp === 'function') return interaction.followUp(body);
    }
    if (interaction.replied && !interaction.deferred && typeof interaction.followUp === 'function') {
        return interaction.followUp(body);
    }
    return interaction.editReply(withoutAckFlags(body));
}

async function replyWithMessage(interaction, payload) {
    const body = prepared(payload);
    if ((interaction.deferred || interaction.replied) && typeof interaction.editReply === 'function') {
        const response = await interaction.editReply(withoutAckFlags(body));
        return messageFrom(response)
            || (typeof interaction.fetchReply === 'function' ? await interaction.fetchReply() : response);
    }
    const response = await interaction.reply({ ...body, withResponse: true });
    return messageFrom(response)
        || (typeof interaction.fetchReply === 'function' ? await interaction.fetchReply() : null);
}

module.exports = {
    isEphemeral,
    defer,
    finish,
    messageFrom,
    replyWithMessage,
};
