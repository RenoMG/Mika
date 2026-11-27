const { MessageFlags } = require('discord.js');
const { isOff } = require('./configStatus');
const { commandBlockedIn } = require('./channelRules');

const CATEGORY_DISABLED = 'A server admin has turned this command off.';
const CHANNEL_DISABLED = 'A server admin has turned this command off in this channel.';
const NO_USER_PERMISSION = "You don't have permission to use this command.";
const NO_BOT_PERMISSION = "I'm missing a permission I need for this command.";

// Same order as the old per-command copies: user permission, bot permission,
// category toggle, then the channel's rules (src/utils/channelRules.js). A null result means the command may run.
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

    if (command.checkDisabledChannels && commandBlockedIn(config, command, channelId)) {
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
