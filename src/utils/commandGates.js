const { MessageFlags } = require('discord.js');
const { isOff, channelIsDisabled } = require('./configStatus');

const CATEGORY_DISABLED = 'A server admin has turned this command off.';
const CHANNEL_DISABLED = 'A server admin has turned commands off in this channel.';
const NO_USER_PERMISSION = "You don't have permission to use this command.";
const NO_BOT_PERMISSION = "I'm missing a permission I need for this command.";

// Same order as the old per-command copies: user permission, bot permission,
// category toggle, then DisabledChannels. A null result means the command may run.
function evaluateCommandGates({ command, config, channelId, memberHas, botHas }) {
    if (command.permissions && command.permissions.length > 0) {
        if (!memberHas) {
            return { content: NO_USER_PERMISSION, flags: MessageFlags.Ephemeral };
        }
        if (!botHas) {
            return { content: NO_BOT_PERMISSION, flags: MessageFlags.Ephemeral };
        }
    }

    if (command.configKey && isOff(config, command.configKey)) {
        return { content: CATEGORY_DISABLED, flags: MessageFlags.Ephemeral };
    }

    if (command.checkDisabledChannels && channelIsDisabled(config, channelId)) {
        return { content: CHANNEL_DISABLED, flags: MessageFlags.Ephemeral };
    }

    return null;
}

module.exports = {
    CATEGORY_DISABLED,
    CHANNEL_DISABLED,
    NO_USER_PERMISSION,
    NO_BOT_PERMISSION,
    evaluateCommandGates,
};
