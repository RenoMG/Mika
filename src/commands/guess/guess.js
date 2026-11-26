const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { embed: styledEmbed, formatNumber } = require('../../utils/style');
const { defer, finish } = require('../../utils/ack');
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
const { loadPageNames } = require('../../guess/names');
const { claimDaily, closeSeason, giftCrystals, leaderboardDocs, readPlayer, unlockAchievements } = require('../../guess/store');
const { packChoices, packOf } = require('../../guess/packs');
const { tierChoices, tierOf } = require('../../guess/difficulty');
const { seasonKey, seasonLabel, seasonEnds, titleText } = require('../../guess/season');
const { ACHIEVEMENTS, unlockText } = require('../../guess/achievements');
const { showShop, showInventory } = require('../../guess/shop');
const { showAbout } = require('../../guess/about');
const { createDuel } = require('../../guess/duel');
const {
    GUESS_PACK_COST, GUESS_WAGER_MIN, GUESS_WAGER_MAX, GUESS_GIFT_DAILY_MAX, GUESS_GIFT_MIN_WINS, GUESS_DAILY_CRYSTALS,
} = require('../../guess/constants');
const { neutralize } = require('../../anime/text');
const { isBotOrApp } = require('../../utils/botAccount');

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
    return finish(interaction, body);
}

function option(interaction, kind, name) {
    const options = interaction.options;
    const read = options && typeof options[kind] === 'function' ? options[kind].bind(options) : null;
    if (!read) return null;
    try { return read(name); } catch { return null; }
}

// hooks.mode, hooks.pack and hooks.difficulty come from a Play again button, which has no options.
async function play(interaction, client, hooks = {}) {
    await defer(interaction);
    const channel = interaction.channel;
    const guild = interaction.guild;
    if (!channel || !guild) return finish(interaction, ephemeral(messageFor({ empty: true })));
    const mode = hooks.mode || option(interaction, 'getString', 'mode') || 'anime';
    const packId = hooks.pack !== undefined ? hooks.pack : option(interaction, 'getString', 'pack');
    const wager = hooks.mode !== undefined ? 0 : option(interaction, 'getInteger', 'wager') || 0;
    const tierId = hooks.difficulty !== undefined ? hooks.difficulty : option(interaction, 'getString', 'difficulty');
    const pack = packId ? packOf(packId) : null;
    const difficulty = tierOf(tierId);
    if (packId && !pack) return finish(interaction, ephemeral("That pack doesn't exist. Pick one from the list."));
    if (pack && mode === 'character') return finish(interaction, ephemeral('Packs are for anime rounds. Drop the pack to play a character round.'));
    if (difficulty && mode === 'character') return finish(interaction, ephemeral('Difficulty is for anime rounds. Drop it to play a character round.'));
    if (wager && (wager < GUESS_WAGER_MIN || wager > GUESS_WAGER_MAX)) {
        return finish(interaction, ephemeral(`Wagers go from ${GUESS_WAGER_MIN} to ${GUESS_WAGER_MAX} 💎.`));
    }
    const run = hooks.startRound || startRound;
    const watch = hooks.watchChannel || watchChannel;
    const result = await run({
        channelId: channel.id,
        guildId: guild.id,
        userId: interaction.user.id,
        ownerName: (interaction.member && interaction.member.displayName)
            || interaction.user.globalName
            || interaction.user.username
            || '',
        manual: true,
        kind: mode === 'character' ? 'character' : 'anime',
        pack,
        packCost: pack ? GUESS_PACK_COST : 0,
        difficulty,
        wager,
        hasContentIntent: clientHasMessageContent(client),
        send: (payload) => finish(interaction, payload),
        attach: (round) => watch(channel, round),
    });
    if (result && result.ok) return result;
    if (result && result.limited) {
        // Keep the original public reply so Discord preserves the command display.
        return finish(interaction, { content: messageFor(result), allowedMentions: allowedMentions() });
    }
    return finish(interaction, ephemeral(messageFor(result)));
}

async function namedRows(client, guildId, season) {
    const docs = await leaderboardDocs(guildId, { season });
    const rows = rowsFrom(docs, (id) => client.users?.cache?.get(id));
    return loadPageNames(client, rows, 0);
}

async function leaderboard(interaction, client) {
    if (typeof interaction.deferReply === 'function' && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }
    const allTime = option(interaction, 'getString', 'period') === 'all';
    const season = allTime ? '' : seasonKey();
    // Hand out last season's titles before showing the new one.
    await closeSeason(interaction.guild.id).catch(() => null);
    const entries = await namedRows(client, interaction.guild.id, season);
    let state = {
        ownerId: interaction.user.id,
        guildName: interaction.guild.name || 'this server',
        period: allTime ? 'All time' : `${seasonLabel(season)} season`,
        note: allTime ? '' : `Season ends ${seasonEnds(season)} (Pacific time). The top 3 earn a title.`,
        entries,
        page: 0,
        loadPage: (entries, page) => loadPageNames(client, entries, page),
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
        state.closed = true;
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

async function achievements(interaction, deps = {}) {
    await defer(interaction);
    const requested = option(interaction, 'getUser', 'user');
    const self = !requested || requested.id === interaction.user.id;
    const target = self ? interaction.user : requested;
    const member = self ? interaction.member : option(interaction, 'getMember', 'user');
    if (!self && isBotOrApp(target)) return finish(interaction, ephemeral(STATS_BOT));
    if (!self && !member) return finish(interaction, ephemeral(STATS_NOT_MEMBER));
    const player = await (deps.readPlayer || readPlayer)(target.id, interaction.guild.id);
    const held = new Set(player?.achievements || []);
    // One line each, unlocked first. The description holds all 19 comfortably.
    const line = (entry) => held.has(entry.id)
        ? `${entry.emoji} **${entry.name}** · ${entry.text}`
        : `🔒 ${entry.name} · ${entry.text} · ${entry.reward} 💎`;
    const unlocked = ACHIEVEMENTS.filter((entry) => held.has(entry.id)).map(line);
    const locked = ACHIEVEMENTS.filter((entry) => !held.has(entry.id)).map(line);
    const embed = styledEmbed({
        title: self ? '🏅 Your achievements' : `🏅 ${statsName(target, member)}'s achievements`,
        description: [
            `**${held.size}**/${ACHIEVEMENTS.length} unlocked`,
            unlocked.join('\n'),
            locked.length ? `**Still to earn**\n${locked.join('\n')}` : '',
        ].filter(Boolean).join('\n\n'),
        label: 'guess',
    });
    return finish(interaction, { embeds: [embed], allowedMentions: allowedMentions() });
}

async function gift(interaction, deps = {}) {
    await defer(interaction);
    const target = option(interaction, 'getUser', 'user');
    const member = option(interaction, 'getMember', 'user');
    const amount = option(interaction, 'getInteger', 'amount');
    if (!target || target.id === interaction.user.id) return finish(interaction, ephemeral("You can't gift crystals to yourself."));
    if (isBotOrApp(target)) return finish(interaction, ephemeral(STATS_BOT));
    if (!member) return finish(interaction, ephemeral("That person isn't in this server. Crystals are kept per server."));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > GUESS_GIFT_DAILY_MAX) {
        return finish(interaction, ephemeral(`Gifts go from 1 to ${GUESS_GIFT_DAILY_MAX} 💎.`));
    }
    const result = await (deps.giftCrystals || giftCrystals)(interaction.user.id, target.id, interaction.guild.id, amount);
    if (result.wins) return finish(interaction, ephemeral(`You need **${GUESS_GIFT_MIN_WINS}** wins before you can send gifts.`));
    if (result.short) return finish(interaction, ephemeral(`You only have **${formatNumber(result.balance)}** 💎.`));
    if (result.cap) return finish(interaction, ephemeral(`You can send **${result.left}** more 💎 today (the limit is ${GUESS_GIFT_DAILY_MAX} a day, Pacific time).`));
    const unlocked = await (deps.unlock || unlockAchievements)(interaction.user.id, interaction.guild.id).catch(() => []);
    const from = neutralize(interaction.member?.displayName || interaction.user.globalName || interaction.user.username, 80) || 'Someone';
    const to = statsName(target, member);
    return finish(interaction, {
        content: [`🎁 **${from}** sent **${formatNumber(amount)}** 💎 to **${to}**!`, unlockText(unlocked)].filter(Boolean).join('\n'),
        allowedMentions: allowedMentions(),
    });
}

async function duel(interaction, deps = {}) {
    const target = option(interaction, 'getUser', 'opponent');
    const member = option(interaction, 'getMember', 'opponent');
    const stake = option(interaction, 'getInteger', 'wager') || 0;
    await defer(interaction);
    if (!target || target.id === interaction.user.id) return finish(interaction, ephemeral("You can't duel yourself."));
    if (isBotOrApp(target)) return finish(interaction, ephemeral("Bots don't play Guess That Anime."));
    if (!member) return finish(interaction, ephemeral("That person isn't in this server."));
    if (stake && (stake < GUESS_WAGER_MIN || stake > GUESS_WAGER_MAX)) {
        return finish(interaction, ephemeral(`Duel stakes go from ${GUESS_WAGER_MIN} to ${GUESS_WAGER_MAX} 💎, or leave it out for a friendly duel.`));
    }
    return (deps.createDuel || createDuel)({ interaction, opponent: target, opponentName: statsName(target, member), stake });
}

// Public on success, so the server sees it; a claim that is cooling down is private.
async function daily(interaction, deps = {}) {
    await defer(interaction);
    const result = await (deps.claimDaily || claimDaily)(interaction.user.id, interaction.guild.id);
    if (!result.ok) {
        const unix = Math.ceil(result.nextAt / 1000);
        return finish(interaction, ephemeral(`⏳ You already claimed today's crystals. Your next claim opens <t:${unix}:R> (<t:${unix}:t>).`));
    }
    const name = statsName(interaction.user, interaction.member);
    return finish(interaction, {
        content: `🎁 **${name}** claimed **${formatNumber(result.amount)}** daily 💎 and now has **${formatNumber(result.balance)}** 💎. Come back in 24 hours for more.`,
        allowedMentions: allowedMentions(),
    });
}

const STATS_NOT_MEMBER = "That person isn't in this server. Guess stats are kept per server.";
const STATS_BOT = "Bots don't play Guess That Anime.";

function statsName(user, member) {
    const raw = (member && member.displayName) || (user && (user.globalName || user.username)) || 'Player';
    return neutralize(raw, 64) || 'Player';
}

// Public, like /level: stats are something people share. Another member's
// stats are only shown for someone in this server, since stats are per server.
async function stats(interaction, deps = {}) {
    await defer(interaction);
    const requested = interaction.options && typeof interaction.options.getUser === 'function'
        ? interaction.options.getUser('user')
        : null;
    const self = !requested || requested.id === interaction.user.id;
    const target = self ? interaction.user : requested;
    const member = self
        ? interaction.member
        : (typeof interaction.options.getMember === 'function' ? interaction.options.getMember('user') : null);
    if (!self && isBotOrApp(target)) return finish(interaction, ephemeral(STATS_BOT));
    if (!self && !member) return finish(interaction, ephemeral(STATS_NOT_MEMBER));
    const read = deps.readPlayer || readPlayer;
    const player = await read(target.id, interaction.guild.id);
    const wins = player ? player.wins : 0;
    const crystals = player ? player.crystals : 0;
    const streak = player && player.streak ? player.streak : 0;
    const best = player && player.bestStreak ? player.bestStreak : 0;
    const gaveUp = player && player.gaveUp ? player.gaveUp : 0;
    const counters = player?.counters || {};
    const titles = (player?.titles || []).slice().sort((a, b) => b.season.localeCompare(a.season) || a.rank - b.rank)
        .slice(0, 5).map(titleText).filter(Boolean);
    const title = self ? '🎯 Your guess stats' : `🎯 ${statsName(target, member)}'s guess stats`;
    // Rows of three: totals, streaks, then duels and achievements.
    const embed = styledEmbed({ title, label: 'guess' })
        .addFields(
            { name: 'Wins', value: `🏆 **${formatNumber(wins)}**`, inline: true },
            { name: `${seasonLabel(seasonKey())}`, value: `📅 **${formatNumber(player?.seasonWins || 0)}**`, inline: true },
            { name: 'Crystals', value: `💎 **${formatNumber(crystals)}**`, inline: true },
            { name: 'Streak', value: `🔥 **${formatNumber(streak)}**`, inline: true },
            { name: 'Best streak', value: `⭐ **${formatNumber(best)}**`, inline: true },
            { name: 'Gave up', value: `🏳️ **${formatNumber(gaveUp)}**`, inline: true },
            { name: 'Duels', value: `⚔️ **${formatNumber(counters.duelWins || 0)}**–${formatNumber(counters.duelLosses || 0)}`, inline: true },
            { name: 'Achievements', value: `🏅 **${player?.achievements?.length || 0}**/${ACHIEVEMENTS.length}`, inline: true },
        );
    if (titles.length) embed.setDescription(titles.join('\n'));
    if (target && typeof target.displayAvatarURL === 'function') embed.setThumbnail(target.displayAvatarURL());
    return finish(interaction, { embeds: [embed], allowedMentions: allowedMentions() });
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
            .setDescription('Starts a round only you can answer; it gets your guesses first. Up to 10 rounds an hour.')
            .addStringOption((option) => option
                .setName('mode')
                .setDescription('Guess the anime from a screenshot, or a character from their portrait.')
                .addChoices({ name: 'Anime screenshot', value: 'anime' }, { name: 'Character', value: 'character' }))
            .addStringOption((option) => option
                .setName('difficulty')
                .setDescription('Easy is popular hits, Hard is deep cuts. Harder pays more. Anime rounds only.')
                .addChoices(...tierChoices()))
            .addStringOption((option) => option
                .setName('pack')
                .setDescription(`Only anime from one genre or era. Costs ${GUESS_PACK_COST} crystals.`)
                .addChoices(...packChoices()))
            .addIntegerOption((option) => option
                .setName('wager')
                .setDescription(`Stake ${GUESS_WAGER_MIN} to ${GUESS_WAGER_MAX} crystals. Win to double it; lose it and your streak.`)
                .setMinValue(GUESS_WAGER_MIN)
                .setMaxValue(GUESS_WAGER_MAX)))
        .addSubcommand((subcommand) => subcommand
            .setName('duel')
            .setDescription('Challenges a member: one screenshot, the first correct answer takes the pot.')
            .addUserOption((option) => option.setName('opponent').setDescription('Who to challenge.').setRequired(true))
            .addIntegerOption((option) => option.setName('wager').setDescription('Crystals each of you stakes. Leave out for a friendly duel.')
                .setMinValue(GUESS_WAGER_MIN).setMaxValue(GUESS_WAGER_MAX)))
        .addSubcommand((subcommand) => subcommand
            .setName('stats')
            .setDescription('Shows wins, crystals, streaks, and give-ups in this server.')
            .addUserOption((option) => option
                .setName('user')
                .setDescription('A member of this server. Defaults to you.')))
        .addSubcommand((subcommand) => subcommand
            .setName('achievements')
            .setDescription('Shows your achievements, or a member\'s.')
            .addUserOption((option) => option
                .setName('user')
                .setDescription('A member of this server. Defaults to you.')))
        .addSubcommand((subcommand) => subcommand
            .setName('leaderboard')
            .setDescription('Shows who has the most wins this season or all time.')
            .addStringOption((option) => option
                .setName('period')
                .setDescription('This quarterly season (default) or all time.')
                .addChoices({ name: 'This season', value: 'season' }, { name: 'All time', value: 'all' })))
        .addSubcommand((subcommand) => subcommand
            .setName('shop')
            .setDescription('Opens the shop for Streak Shields and crystal boosts.'))
        .addSubcommand((subcommand) => subcommand
            .setName('inventory')
            .setDescription('Shows the items you hold, and starts a boost.'))
        .addSubcommand((subcommand) => subcommand
            .setName('gift')
            .setDescription(`Sends crystals to another member. No fee, up to ${GUESS_GIFT_DAILY_MAX} a day.`)
            .addUserOption((option) => option.setName('user').setDescription('Who gets the crystals.').setRequired(true))
            .addIntegerOption((option) => option.setName('amount').setDescription('How many crystals.')
                .setRequired(true).setMinValue(1).setMaxValue(GUESS_GIFT_DAILY_MAX)))
        .addSubcommand((subcommand) => subcommand
            .setName('daily')
            .setDescription(`Claims ${GUESS_DAILY_CRYSTALS} free crystals. Once every 24 hours.`))
        .addSubcommand((subcommand) => subcommand
            .setName('about')
            .setDescription('Explains difficulty, hints, packs, wagers, duels, crystals, and seasons.'))),
    category: 'guess',
    configKey: 'GuessCommandStatus',
    replies: 'public',
    subcommandReplies: { shop: 'private', inventory: 'private', about: 'private' },
    checkDisabledChannels: true,
    example: '/guess play',
    examples: {
        play: '/guess play difficulty:Hard',
        daily: '/guess daily',
        leaderboard: '/guess leaderboard',
        stats: '/guess stats user:@user',
        about: '/guess about',
        shop: '/guess shop',
        inventory: '/guess inventory',
        gift: '/guess gift user:@user amount:100',
        duel: '/guess duel opponent:@user wager:50',
        achievements: '/guess achievements',
    },
    play,
    async execute(interaction, client, deps) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'leaderboard') return leaderboard(interaction, client);
        if (sub === 'stats') return stats(interaction, deps || {});
        if (sub === 'about') return showAbout(interaction);
        if (sub === 'shop') return showShop(interaction, deps || {});
        if (sub === 'inventory') return showInventory(interaction, deps || {});
        if (sub === 'gift') return gift(interaction, deps || {});
        if (sub === 'duel') return duel(interaction, deps || {});
        if (sub === 'achievements') return achievements(interaction, deps || {});
        if (sub === 'daily') return daily(interaction, deps || {});
        return play(interaction, client, deps || {});
    },
};
