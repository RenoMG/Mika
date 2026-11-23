const { Colors, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { PLACEHOLDER_ICON } = require('../../brand');
const { allowedMentions } = require('../../utils/mentions');
const { redact } = require('../../utils/redact');
const { applySlashDefaults } = require('../../utils/slashCommand');
const {
    GUESS_BOARD_TIMEOUT_MS,
    buildGuessBoard,
    onBoardClick,
    pageCount,
    rowsFrom,
} = require('../../guess/board');
const {
    clientHasMessageContent,
    messageFor,
    startRound,
    watchChannel,
} = require('../../guess/round');
const { leaderboardDocs, readPlayer } = require('../../guess/store');

function footerIcon() {
    return process.env.MIKAICON || PLACEHOLDER_ICON;
}

function ephemeral(content) {
    return {
        content,
        flags: MessageFlags.Ephemeral,
        allowedMentions: allowedMentions(),
    };
}

async function respond(interaction, payload) {
    const body = { ...payload, allowedMentions: allowedMentions() };
    if (interaction.deferred || interaction.replied) return interaction.editReply(body);
    return interaction.reply(body);
}

async function play(interaction, client) {
    const channel = interaction.channel;
    const guild = interaction.guild;
    if (!channel || !guild) return interaction.reply(ephemeral(messageFor({ empty: true })));
    const result = await startRound({
        channelId: channel.id,
        guildId: guild.id,
        userId: interaction.user.id,
        manual: true,
        hasContentIntent: clientHasMessageContent(client),
        send: (payload) => interaction.reply(payload),
        attach: (round) => watchChannel(channel, round),
    });
    if (result.ok || interaction.replied || interaction.deferred) return result;
    return interaction.reply(ephemeral(messageFor(result)));
}

async function namedRows(client, guildId) {
    const docs = await leaderboardDocs(guildId);
    const users = new Map();
    for (const doc of docs) {
        try {
            if (client && client.users && typeof client.users.fetch === 'function') {
                users.set(doc.userID, await client.users.fetch(doc.userID));
            }
        } catch (error) {
            users.set(doc.userID, null);
        }
    }
    return rowsFrom(docs, (id) => users.get(String(id)) || null);
}

async function leaderboard(interaction, client) {
    if (typeof interaction.deferReply === 'function' && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }
    const entries = await namedRows(client, interaction.guild.id);
    let state = {
        ownerId: interaction.user.id,
        guildName: interaction.guild.name || 'this server',
        entries,
        page: 0,
    };
    const view = buildGuessBoard(state);
    const response = await respond(interaction, { ...view, withResponse: true });
    const message = response && response.resource && response.resource.message
        ? response.resource.message
        : (typeof interaction.fetchReply === 'function' ? await interaction.fetchReply() : null);
    if (!message || typeof message.createMessageComponentCollector !== 'function') return response;
    if (pageCount(entries.length) < 2) return response;
    const collector = message.createMessageComponentCollector({ time: GUESS_BOARD_TIMEOUT_MS });
    collector.on('collect', async (component) => {
        try {
            state = await onBoardClick(component, state);
        } catch (error) {
            console.error('Guess leaderboard button failed.', redact(error));
        }
    });
    collector.on('end', async () => {
        const closed = buildGuessBoard({ ...state, disabled: true });
        try {
            await interaction.editReply({
                embeds: closed.embeds,
                components: closed.components,
                allowedMentions: allowedMentions(),
            });
        } catch (error) {
            // The message can already be gone when the collector ends.
        }
    });
    return response;
}

async function stats(interaction) {
    const player = await readPlayer(interaction.user.id, interaction.guild.id);
    const wins = player ? player.wins : 0;
    const crystals = player ? player.crystals : 0;
    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Your guesses')
            .setDescription(`Wins: **${wins}**\nCrystals: **${crystals}**`)
            .setFooter({ text: 'Mika | 🎌 guess', iconURL: footerIcon() })
            .setTimestamp()],
        flags: MessageFlags.Ephemeral,
        allowedMentions: allowedMentions(),
    });
}

// /guess cannot be run on its own. Discord only invokes a subcommand when the
// parent has any, so the round, the board, and the stats stay under one root
// command instead of three.
module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('guess')
        .setDescription('Guess the anime from a screenshot.')
        .addSubcommand((subcommand) => subcommand
            .setName('play')
            .setDescription('Post a screenshot. The first correct title wins.'))
        .addSubcommand((subcommand) => subcommand
            .setName('leaderboard')
            .setDescription('Shows who has the most correct guesses.'))
        .addSubcommand((subcommand) => subcommand
            .setName('stats')
            .setDescription('Shows your guess wins and crystals.'))),
    category: 'guess',
    checkDisabledChannels: true,
    example: '/guess play',
    examples: {
        play: '/guess play',
        leaderboard: '/guess leaderboard',
        stats: '/guess stats',
    },
    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'leaderboard') return leaderboard(interaction, client);
        if (sub === 'stats') return stats(interaction);
        return play(interaction, client);
    },
};
