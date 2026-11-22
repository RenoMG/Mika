const { AttachmentBuilder, Colors, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const Levels = require('../../levels');
const { PLACEHOLDER_ICON } = require('../../brand');
const { botRankReply, isBotOrApp, knownBotIdsFrom } = require('../../utils/botAccount');
const cards = require('../../utils/cards');
const {
    LEADERBOARD_TIMEOUT_MS,
    buildLeaderboardView,
    leaderboardWindow,
    onLeaderboardClick,
    pageCount,
} = require('../../utils/leaderboard');
const { applySlashDefaults } = require('../../utils/slashCommand');

Levels.setURL(`${process.env.MIKADATABASE}`).catch((error) => {
    console.error('Leveling database connection failed.', error);
});

function footerIcon() {
    return process.env.MIKAICON || PLACEHOLDER_ICON;
}

async function respond(interaction, payload) {
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    return interaction.reply(payload);
}

async function displayNameFor(interaction, user) {
    if (interaction.guild && interaction.guild.members && user && user.id) {
        try {
            const cached = interaction.guild.members.cache && typeof interaction.guild.members.cache.get === 'function'
                ? interaction.guild.members.cache.get(user.id)
                : null;
            const member = cached
                || (typeof interaction.guild.members.fetch === 'function'
                    ? await interaction.guild.members.fetch(user.id)
                    : null);
            if (member && member.displayName) return member.displayName;
        } catch (error) {
            // The member left, or the guild member cache is not available.
        }
    }
    return (user && (user.globalName || user.username)) || 'Unknown user';
}

function avatarUrlOf(user) {
    if (!user || typeof user.displayAvatarURL !== 'function') return '';
    try {
        const url = user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
        return typeof url === 'string' ? url : '';
    } catch (error) {
        return '';
    }
}

function count(value) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= 0 ? number : 0;
}

function rankEmbed({ displayName, level, rank, current, needed }) {
    const lines = [
        `Level **${count(level)}**`,
        count(rank) > 0 ? `Rank **#${count(rank)}**` : 'Rank **unranked**',
        `**${count(current)}** / **${count(needed)}** XP toward the next level`,
    ];
    return new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(String(displayName || 'Unknown user').slice(0, 256))
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Mika | 🏆 levels', iconURL: footerIcon() })
        .setTimestamp();
}

async function replyRank(interaction, discordUser, user, displayName) {
    const card = {
        displayName,
        level: user.level,
        rank: user.position || 0,
        current: user.cleanXp,
        needed: user.cleanNextLevelXp,
        avatarURL: avatarUrlOf(discordUser),
    };
    if (!card.avatarURL) return respond(interaction, { embeds: [rankEmbed(card)] });
    try {
        const png = await cards.renderRankCard(card);
        return respond(interaction, {
            files: [new AttachmentBuilder(png, { name: 'rank.png' })],
        });
    } catch (error) {
        console.error('Rank card failed.', error);
        return respond(interaction, { embeds: [rankEmbed(card)] });
    }
}

async function humanBoard(client, guildId) {
    const raw = await Levels.fetchLeaderboard(guildId, Infinity);
    if (!raw.length) return [];
    return Levels.computeLeaderboard(client, raw, { knownBotIds: knownBotIdsFrom(client) });
}

async function replyLeaderboard(interaction, client) {
    if (typeof interaction.deferReply === 'function' && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    const guildName = interaction.guild.name || 'this server';
    // Filter bots before the top-50 window so they do not consume those slots.
    const { rows, more } = leaderboardWindow(await humanBoard(client, interaction.guild.id));
    let state = {
        ownerId: interaction.user.id,
        guildName,
        entries: rows,
        more,
        page: 0,
    };
    const view = buildLeaderboardView(state);
    const response = await respond(interaction, { ...view, withResponse: true });
    const message = response && response.resource && response.resource.message
        ? response.resource.message
        : (typeof interaction.fetchReply === 'function' ? await interaction.fetchReply() : null);
    if (!message || typeof message.createMessageComponentCollector !== 'function') return response;
    if (pageCount(state.entries.length) < 2) return response;

    const collector = message.createMessageComponentCollector({ time: LEADERBOARD_TIMEOUT_MS });
    collector.on('collect', async (component) => {
        try {
            state = await onLeaderboardClick(component, state);
        } catch (error) {
            console.error('Leaderboard button failed.', error);
        }
    });
    collector.on('end', async () => {
        const closed = buildLeaderboardView({ ...state, disabled: true });
        try {
            await interaction.editReply({ embeds: closed.embeds, components: closed.components });
        } catch (error) {
            // The message can already be gone when the collector ends.
        }
    });
    return response;
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('levels')
        .setDescription('Leveling based commands.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('rank')
                .setDescription("Returns a member's rank.")
                .addUserOption(option => option.setName('target').setDescription('Member to look up. Defaults to you.')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Returns the server leaderboard.'))),
    category: 'leveling',
    configKey: 'LevelingCommandStatus',
    checkDisabledChannels: true,
    example: '/levels rank',
    examples: {
        rank: '/levels rank target:@user',
        leaderboard: '/levels leaderboard',
    },
    async execute(interaction, client) {
        try {
            const sub = interaction.options.getSubcommand();
            if (!interaction.guild) return interaction.reply('You are at level 0');

            if (sub === 'rank') {
                const target = interaction.options.getUser('target') || interaction.user;
                if (!target || !target.id) return interaction.reply('You are at level 0');
                // Before defer, getGuildConfig, and the level upsert inside Levels.fetch.
                if (isBotOrApp(target)) return interaction.reply(botRankReply());
                if (typeof interaction.deferReply === 'function' && !interaction.deferred && !interaction.replied) {
                    await interaction.deferReply();
                }

                const user = await Levels.fetch(target.id, interaction.guild.id, false);
                const who = target.id === interaction.user.id ? 'You are' : `${target.username || 'That member'} is`;
                if (!user) return respond(interaction, { content: `${who} at level 0` });
                const board = await humanBoard(client, interaction.guild.id);
                const placed = board.find((entry) => entry.userID === target.id);
                user.position = placed ? placed.position : 0;
                const displayName = await displayNameFor(interaction, target);
                return replyRank(interaction, target, user, displayName);
            }

            if (sub === 'leaderboard') return replyLeaderboard(interaction, client);

            return interaction.reply('no subcommand was used.');
        } catch (error) {
            // Rank and the leaderboard defer before the database and avatar work.
            // interactionCreate replies itself only when nothing has been acknowledged yet.
            if (!(interaction.deferred || interaction.replied)) throw error;
            console.error('Levels command failed.', error);
            try {
                await interaction.editReply({
                    content: 'There was an error while executing this command!',
                    embeds: [],
                    components: [],
                });
            } catch (editError) {
                console.error('Levels command failed.', editError);
            }
        }
    },
};
