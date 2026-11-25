const { MessageFlags } = require('discord.js');

const CATEGORY_DISABLED = 'A server admin has turned this command off.';
const CHANNEL_DISABLED = 'A server admin has turned commands off in this channel.';
const NO_USER_PERMISSION = "You don't have permission to use this command.";
const NO_BOT_PERMISSION = "I'm missing a permission I need for this command.";

function statusIsDisabled(list) {
    const status = (Array.isArray(list) ? list : []).map((entry) => entry.Status);
    return `${status}` === 'false';
}

function channelIsDisabled(disabledChannels, channelId) {
    return (Array.isArray(disabledChannels) ? disabledChannels : [])
        .map((entry) => entry.Channels)
        .includes(channelId);
}

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

    if (command.configKey && statusIsDisabled(config && config[command.configKey])) {
        return { content: CATEGORY_DISABLED, flags: MessageFlags.Ephemeral };
    }

    if (command.checkDisabledChannels && channelIsDisabled(config && config.DisabledChannels, channelId)) {
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
