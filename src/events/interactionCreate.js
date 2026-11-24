const { defer, finish } = require('../utils/ack');
const { MessageFlags } = require('discord.js');
const guildConfig = require('../utils/getGuildConfig');
const { evaluateCommandGates } = require('../utils/commandGates');
const { botRankReply, rankTargetsBot } = require('../utils/botAccount');
const { redact } = require('../utils/redact');
const { allowedMentions } = require('../utils/mentions');
const { isQuietError } = require('../utils/interactionErrors');
const { noteAutocompleteError } = require('../anime/autocomplete');
const { handleRecommendButton, isRecommendButton } = require('../anime/recommend');
const { isReplayButton, handleReplay } = require('../guess/replay');
const { handleBioModal, isBioModalId } = require('../commands/anime/bio');
const {
    handleConfigComponent,
    handleConfigModal,
    isConfigComponentId,
    isConfigModalId,
} = require('../commands/configuration/handlers/panel');

const GENERIC_ERROR = 'There was an error while executing this command!';

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
        // Accept and Decline are delivered in DMs, so they have to run before the
        // guild check. Every slash command stays server-only.
        if (isKind(interaction, 'isButton')) {
            if (isReplayButton(interaction.customId)) {
                await runGuarded(interaction, () => handleReplay(interaction, client));
                return;
            }
            if (isRecommendButton(interaction.customId)) {
                try {
                    await handleRecommendButton(interaction, client);
                } catch (error) {
                    console.error(redact(error));
                    try {
                        await replyError(interaction);
                    } catch (replyFailure) {
                        if (!isQuietError(replyFailure)) console.error(redact(replyFailure));
                    }
                }
                return;
            }
            if (isConfigComponentId(interaction.customId)) {
                await runGuarded(interaction, () => handleConfigComponent(interaction));
            }
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
            } else if (isBioModalId(interaction.customId)) {
                await runGuarded(interaction, () => handleBioModal(interaction));
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;
        if (!interaction.guild) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            const invokerPerms = command.permissions;
            const botPerms = command.botPermissions && command.botPermissions.length
                ? command.botPermissions
                : command.permissions;
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

            const privateCommands = new Set(['help', 'config', 'bio', 'completed', 'favorite', 'watching', 'genres', 'settings', 'setup', 'recommend']);
            const publicList = ['favorite', 'watching', 'completed'].includes(interaction.commandName)
                && interaction.options?.getSubcommand?.(false) === 'list';
            await defer(interaction, { ephemeral: privateCommands.has(interaction.commandName) && !publicList });
            if (command.configKey || command.checkDisabledChannels) {
                const config = await guildConfig.getGuildConfig(interaction.guild.id);
                gate = evaluateCommandGates({ command, config, channelId, memberHas: true, botHas: true });
                if (gate) return await finish(interaction, gate);
            }

            await command.execute(interaction, client);
        } catch (error) {
            console.error(redact(error));
            if (error?.name === 'VersionError') {
                await finish(interaction, { content: 'This changed while you were editing it. Open the command again and retry.', flags: MessageFlags.Ephemeral });
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
