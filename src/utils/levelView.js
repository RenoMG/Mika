const { AttachmentBuilder } = require('discord.js');
const Levels = require('../levels');
const { embed: styledEmbed, formatNumber } = require('./style');
const { knownBotIdsFrom } = require('./botAccount');
const cards = require('./cards');
const { redact } = require('./redact');
const {
    LEADERBOARD_TIMEOUT_MS,
    buildLeaderboardView,
    leaderboardWindow,
    onLeaderboardClick,
    pageCount,
} = require('./leaderboard');



const NO_XP_YOU = "You haven't earned any XP yet. Chat in the server to start leveling up!";

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
    return styledEmbed({ title: displayName || 'Unknown user', label: 'levels' })
        .addFields(
            { name: 'Level', value: `**${formatNumber(count(level))}**`, inline: true },
            { name: 'Rank', value: count(rank) > 0 ? `**#${formatNumber(count(rank))}**` : 'Unranked', inline: true },
            { name: 'Next level', value: `${formatNumber(count(current))} / ${formatNumber(count(needed))} XP`, inline: true },
        );
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
        console.error('Rank card failed.', redact(error));
        return respond(interaction, { embeds: [rankEmbed(card)] });
    }
}

async function humanBoard(client, guildId) {
    const rows = [];
    const exclude = knownBotIdsFrom(client);
    let after;
    for (let batchNumber = 0; rows.length < 51 && batchNumber < 5; batchNumber += 1) {
        const raw = await Levels.fetchLeaderboard(guildId, 60, { after, exclude });
        after = raw.at(-1);
        const batch = await Levels.computeLeaderboard(client, raw, { knownBotIds: exclude });
        rows.push(...batch);
        if (raw.length < 60) break;
    }
    return rows.slice(0, 51).map((row, index) => ({ ...row, position: index + 1 }));
}

async function replyLeaderboard(interaction, client) {
    if (typeof interaction.deferReply === 'function' && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    const guildName = interaction.guild.name || 'this server';
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
            console.error('Leaderboard button failed.', redact(error));
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

async function showRank(interaction, client) {
    const target = (interaction.options && typeof interaction.options.getUser === 'function'
        ? interaction.options.getUser('target')
        : null) || interaction.user;
    if (!target || !target.id) return interaction.reply(NO_XP_YOU);
    if (typeof interaction.deferReply === 'function' && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    const user = await Levels.fetch(target.id, interaction.guild.id, false);
    if (!user) {
        const content = target.id === interaction.user.id
            ? NO_XP_YOU
            : `**${await displayNameFor(interaction, target)}** hasn't earned any XP yet.`;
        return respond(interaction, { content, allowedMentions: { parse: [] } });
    }
    user.position = await Levels.rankPosition(target.id, interaction.guild.id, user.xp, knownBotIdsFrom(client));
    const displayName = await displayNameFor(interaction, target);
    return replyRank(interaction, target, user, displayName);
}

module.exports = {
    showRank,
    replyLeaderboard,
};
