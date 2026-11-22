const { MessageFlags } = require('discord.js');

const BOT_RANK_MESSAGE = "This is a bot/app account, so it can't have a rank.";

// Discord sets `bot` when the account belongs to an OAuth2 application, which
// covers both classic bots and app accounts. `system` is Discord's own user.
function isBotOrApp(user) {
    return Boolean(user && (user.bot === true || user.system === true));
}

function botRankReply() {
    return { content: BOT_RANK_MESSAGE, flags: MessageFlags.Ephemeral };
}

function knownBotIdsFrom(client) {
    const ids = new Set();
    const id = client && client.user && client.user.id;
    if (id) ids.add(String(id));
    return ids;
}

// True only for an explicit /levels rank target. Looking up yourself passes
// no target, and a person cannot invoke a slash command as a bot.
function rankTargetsBot(interaction, command) {
    if (!command || !command.data || command.data.name !== 'levels') return false;
    if (!interaction || !interaction.options || typeof interaction.options.getSubcommand !== 'function') return false;
    let sub = null;
    try {
        sub = interaction.options.getSubcommand(false);
    } catch (error) {
        return false;
    }
    if (sub !== 'rank') return false;
    if (typeof interaction.options.getUser !== 'function') return false;
    return isBotOrApp(interaction.options.getUser('target'));
}

module.exports = {
    BOT_RANK_MESSAGE,
    isBotOrApp,
    botRankReply,
    knownBotIdsFrom,
    rankTargetsBot,
};
