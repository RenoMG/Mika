const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { defer, finish } = require('../utils/ack');
const { allowedMentions } = require('../utils/mentions');
const { getGuildConfig } = require('../utils/getGuildConfig');
const { evaluateCommandGates } = require('../utils/commandGates');
const REPLAY_MS = 10 * 60 * 1000;
function replayRow(round, now = Date.now(), disabled = false) {
    return new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`guess:replay:${round.manual ? round.userId : '0'}:${now + REPLAY_MS}`)
        .setLabel('Play again').setEmoji('🎲').setStyle(ButtonStyle.Secondary).setDisabled(disabled));
}
function isReplayButton(id) { return typeof id === 'string' && id.startsWith('guess:replay:'); }
async function handleReplay(interaction, client, deps = {}) {
    const reject = (content) => finish(interaction, { content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    const match = /^guess:replay:(0|\d{17,20}):(\d{13})$/.exec(interaction.customId || '');
    const now = (deps.now || Date.now)();
    if (!match || !interaction.guild || interaction.message?.author?.id !== client.user?.id
        || Number(match[2]) <= now || Number(match[2]) > now + REPLAY_MS + 1000) {
        return reject('This button has expired. Start a new round with /guess play.');
    }
    if (match[1] !== '0' && match[1] !== interaction.user.id) {
        return reject('That was their round! You can start your own with /guess play.');
    }
    const channel = interaction.channel;
    const sendPermission = channel?.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
    const memberPerms = channel?.permissionsFor?.(interaction.user.id);
    const botPerms = channel?.permissionsFor?.(client.user.id);
    if (!memberPerms?.has([PermissionFlagsBits.ViewChannel, sendPermission, PermissionFlagsBits.UseApplicationCommands])) {
        return reject("You don't have permission to play in this channel.");
    }
    if (!botPerms?.has([PermissionFlagsBits.ViewChannel, sendPermission, PermissionFlagsBits.EmbedLinks])) {
        return reject("I need permission to send messages and embed links here.");
    }
    await defer(interaction);
    const command = require('../commands/guess/guess');
    const config = await (deps.readConfig || getGuildConfig)(interaction.guild.id);
    const gate = evaluateCommandGates({ command, config, channelId: interaction.channelId || interaction.channel?.id, memberHas: true, botHas: true });
    if (gate) return finish(interaction, gate);
    const result = await (deps.play || command.play)(interaction, client);
    if (result?.ok && match[1] !== '0') {
        // A successful new personal round replaces the old replay control.
        try { await interaction.message.edit({ components: [replayRow({ manual: true, userId: match[1] }, now, true)] }); }
        catch { /* Deleted reveal or missing edit permissions do not affect the round. */ }
    }
    return result;
}
module.exports = { REPLAY_MS, replayRow, isReplayButton, handleReplay };
