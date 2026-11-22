const { MessageFlags } = require('discord.js');
const guildConfig = require('../utils/getGuildConfig');
const { evaluateCommandGates } = require('../utils/commandGates');
const { botRankReply, rankTargetsBot } = require('../utils/botAccount');
const { redact } = require('../utils/redact');
const { allowedMentions } = require('../utils/mentions');
const { handleRecommendButton, isRecommendButton } = require('../anime/recommend');

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
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
}

function hasPerms(holder, perms) {
    return Boolean(holder && holder.permissions && holder.permissions.has(perms));
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // Accept and Decline are delivered in DMs, so they have to run before the
        // guild check. Every slash command stays server-only.
        if (isKind(interaction, 'isButton')) {
            if (!isRecommendButton(interaction.customId)) return;
            try {
                await handleRecommendButton(interaction, client);
            } catch (error) {
                console.error(redact(error));
                try {
                    await replyError(interaction);
                } catch (replyError) {
                    console.error(redact(replyError));
                }
            }
            return;
        }

        if (isKind(interaction, 'isAutocomplete')) {
            const command = client.commands && client.commands.get(interaction.commandName);
            if (!command || typeof command.autocomplete !== 'function') return;
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(redact(error));
                try {
                    if (!interaction.responded) await interaction.respond([]);
                } catch (respondError) {
                    console.error(redact(respondError));
                }
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
            if (gate) return await interaction.reply(gate);

            // A bot or app rank target must not upsert the guild config or a level row.
            if (rankTargetsBot(interaction, command)) {
                return await interaction.reply(botRankReply());
            }

            if (command.configKey || command.checkDisabledChannels) {
                const config = await guildConfig.getGuildConfig(interaction.guild.id);
                gate = evaluateCommandGates({ command, config, channelId, memberHas: true, botHas: true });
                if (gate) return await interaction.reply(gate);
            }

            await command.execute(interaction, client);
        } catch (error) {
            console.error(redact(error));
            try {
                await replyError(interaction);
            } catch (replyFailure) {
                console.error(redact(replyFailure));
            }
        }
    },
};
