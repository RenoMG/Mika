const { defer, finish } = require('../utils/ack');
const { MessageFlags } = require('discord.js');
const guildConfig = require('../utils/getGuildConfig');
const { CATEGORY_DISABLED, evaluateCommandGates } = require('../utils/commandGates');
const { isOff } = require('../utils/configStatus');
const { botRankReply, rankTargetsBot } = require('../utils/botAccount');
const { replyIsPrivate } = require('../utils/replyVisibility');
const { handleLinkButton, isLinkButton } = require('../commands/anime/link');
const { redact } = require('../utils/redact');
const { allowedMentions } = require('../utils/mentions');
const { isQuietError } = require('../utils/interactionErrors');
const { noteAutocompleteError } = require('../anime/autocomplete');
const { isReplayButton, handleReplay } = require('../guess/replay');
const { isHintButton, handleHint } = require('../guess/hints');
const { isGiveUpButton, handleGiveUp } = require('../guess/giveup');
const { isDuelButton, handleDuel } = require('../guess/duel');
const { isShopButton, handleShop } = require('../guess/shop');
const {
    handleConfigComponent,
    handleConfigModal,
    isConfigComponentId,
    isConfigModalId,
} = require('../commands/configuration/handlers/panel');

const { GENERIC_ERROR, STALE_EDIT } = require('../utils/messages');


function isKind(interaction, method) {
    return Boolean(interaction && typeof interaction[method] === 'function' && interaction[method]());
}

async function replyError(interaction) {
    const payload = {
        content: GENERIC_ERROR,
        flags: MessageFlags.Ephemeral,
        allowedMentions: allowedMentions(),
    };
    try {
        if (interaction.deferred && !interaction.replied) {
            await interaction.editReply({
                content: GENERIC_ERROR,
                allowedMentions: allowedMentions(),
            });
            return;
        }
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
            return;
        }
        await interaction.reply(payload);
    } catch (error) {
        if (isQuietError(error)) return;
        throw error;
    }
}

function hasPerms(holder, perms) {
    return Boolean(holder && holder.permissions && holder.permissions.has(perms));
}

// Buttons outlive the command that posted them, so a feature turned off under
// /config command also stops its buttons. Outside a server there is nothing to check.
async function featureOff(interaction, key) {
    if (!interaction.guild) return false;
    const config = await guildConfig.getGuildConfig(interaction.guild.id, { readOnly: true });
    if (!isOff(config, key)) return false;
    await finish(interaction, { content: CATEGORY_DISABLED, flags: MessageFlags.Ephemeral });
    return true;
}

const BUTTONS = [
    { matches: isHintButton, run: handleHint, feature: 'GuessCommandStatus' },
    { matches: isGiveUpButton, run: handleGiveUp, feature: 'GuessCommandStatus' },
    { matches: isDuelButton, run: handleDuel, feature: 'GuessCommandStatus' },
    { matches: isShopButton, run: handleShop, feature: 'GuessCommandStatus' },
    { matches: isReplayButton, run: handleReplay, feature: 'GuessCommandStatus' },
    { matches: isLinkButton, run: (interaction) => handleLinkButton(interaction), feature: 'AnimeCommandStatus' },
    { matches: isConfigComponentId, run: (interaction) => handleConfigComponent(interaction) },
];

async function runGuarded(interaction, run) {
    try {
        await run();
    } catch (error) {
        if (isQuietError(error)) return;
        console.error(redact(error));
        try {
            await replyError(interaction);
        } catch (replyFailure) {
            if (!isQuietError(replyFailure)) console.error(redact(replyFailure));
        }
    }
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // Buttons run before the guild check. Every slash command stays server-only.
        if (isKind(interaction, 'isButton')) {
            const button = BUTTONS.find((entry) => entry.matches(interaction.customId));
            if (!button) return;
            await runGuarded(interaction, async () => {
                if (button.feature && await featureOff(interaction, button.feature)) return;
                await button.run(interaction, client);
            });
            return;
        }

        if (isKind(interaction, 'isStringSelectMenu')
            || isKind(interaction, 'isChannelSelectMenu')
            || isKind(interaction, 'isRoleSelectMenu')) {
            if (isConfigComponentId(interaction.customId)) {
                await runGuarded(interaction, () => handleConfigComponent(interaction));
            }
            return;
        }

        if (isKind(interaction, 'isAutocomplete')) {
            const command = client.commands && client.commands.get(interaction.commandName);
            if (!command || typeof command.autocomplete !== 'function') return;
            try {
                // A turned-off command offers no suggestions. Only the cached
                // settings are read, so typing never waits on the database.
                const cached = interaction.guildId ? guildConfig.peekGuildConfig(interaction.guildId) : null;
                if (command.configKey && isOff(cached, command.configKey)) {
                    await interaction.respond([]);
                    return;
                }
                await command.autocomplete(interaction);
            } catch (error) {
                if (!noteAutocompleteError(error)) return;
                try {
                    if (!interaction.responded) await interaction.respond([]);
                } catch (respondError) {
                    noteAutocompleteError(respondError);
                }
            }
            return;
        }

        if (isKind(interaction, 'isModalSubmit')) {
            if (isConfigModalId(interaction.customId)) {
                await runGuarded(interaction, () => handleConfigModal(interaction));
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;
        if (!interaction.guild) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            const invokerPerms = command.permissions;
            // An explicit botPermissions list (even an empty one) replaces the invoker's list.
            const botPerms = Array.isArray(command.botPermissions) ? command.botPermissions : command.permissions;
            const memberHas = invokerPerms?.length
                ? hasPerms(interaction.member, invokerPerms)
                : true;
            const me = interaction.guild && interaction.guild.members ? interaction.guild.members.me : null;
            const botHas = botPerms?.length ? hasPerms(me, botPerms) : true;
            const channelId = interaction.channel.id;
            // Permission is decided before the guild document is read, matching the old
            // interactionCreate check that ran before execute (and before getGuildConfig).
            let gate = evaluateCommandGates({ command, config: null, channelId, memberHas, botHas });
            if (gate) return await finish(interaction, gate);

            // A bot or app rank target must not upsert the guild config or a level row.
            if (rankTargetsBot(interaction, command)) {
                return await interaction.reply(botRankReply());
            }

            // Cheap checks on the options (a missing member, a bad hierarchy) answer
            // privately before the reply is deferred, so they never flash publicly.
            if (typeof command.precheck === 'function') {
                // A turned-off category answers first when its settings are cached.
                const cached = guildConfig.peekGuildConfig(interaction.guild.id);
                gate = cached && evaluateCommandGates({ command, config: cached, channelId, memberHas: true, botHas: true });
                if (gate) return await finish(interaction, gate);
                const problem = command.precheck(interaction);
                if (problem) {
                    return await finish(interaction, {
                        content: problem,
                        flags: MessageFlags.Ephemeral,
                        allowedMentions: allowedMentions(),
                    });
                }
            }

            await defer(interaction, { ephemeral: replyIsPrivate(command, interaction) });
            if (command.configKey || command.checkDisabledChannels) {
                const config = await guildConfig.getGuildConfig(interaction.guild.id, { readOnly: true });
                gate = evaluateCommandGates({ command, config, channelId, memberHas: true, botHas: true });
                if (gate) return await finish(interaction, gate);
            }

            await command.execute(interaction, client);
        } catch (error) {
            console.error(redact(error));
            if (error?.name === 'VersionError') {
                await finish(interaction, { content: STALE_EDIT, flags: MessageFlags.Ephemeral });
                return;
            }
            try {
                await replyError(interaction);
            } catch (replyFailure) {
                if (!isQuietError(replyFailure)) console.error(redact(replyFailure));
            }
        }
    },
};
