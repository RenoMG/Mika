const { MessageFlags } = require('discord.js');
const { embed: styledEmbed } = require('../utils/style');
const { defer, finish } = require('../utils/ack');
const { allowedMentions } = require('../utils/mentions');
const { HINTS } = require('./hints');
const { TIERS } = require('./difficulty');
const {
    GUESS_CRYSTALS, GUESS_PLAY_LIMIT, GUESS_ROUND_MS, GUESS_HINT_BONUS_MS, GUESS_PACK_COST,
    GUESS_WAGER_MIN, GUESS_WAGER_MAX, GUESS_GIFT_DAILY_MAX, GUESS_GIFT_MIN_WINS, GUESS_DAILY_CRYSTALS,
} = require('./constants');

const hint = (kind) => `${HINTS[kind].label} ${HINTS[kind].cost}`;

// How the game works, in one private page. Prices come from the same
// constants the game uses, so this page cannot drift from the rules.
function aboutPayload() {
    const sections = [
        ['🎯 Playing', `\`/guess play\` starts a round only you can answer: **${GUESS_ROUND_MS / 1000} seconds**, up to ${GUESS_PLAY_LIMIT} rounds an hour. Name the anime, including the season or movie. Add \`mode:Character\` to name a character instead. Reply to the image for feedback.`],
        ['💎 Crystals', `A win pays **${GUESS_CRYSTALS}** 💎, doubled on weekends (Pacific time) or with a boost. \`/guess daily\` gives **${GUESS_DAILY_CRYSTALS}** 💎 free every 24 hours. Achievements pay one-time bonuses (\`/guess achievements\`).`],
        ['📶 Difficulty', `\`difficulty:\` ${TIERS.easy.emoji} **Easy** is popular hits for **${TIERS.easy.crystals}** 💎. ${TIERS.hard.emoji} **Hard** is deep cuts for **${TIERS.hard.crystals}** 💎. Normal is everything. Anime rounds only.`],
        ['💡 Hints', `${hint('genre')} · ${hint('studio')} · ${hint('screenshot')} · ${hint('letters')} 💎\nCharacter rounds: ${hint('anime')} · ${hint('letters')} 💎\nEach adds ${GUESS_HINT_BONUS_MS / 1000} seconds and cuts the reward by 25%.`],
        ['🎲 Packs and wagers', `\`pack:\` plays one genre or era for **${GUESS_PACK_COST}** 💎.\n\`wager:\` stakes ${GUESS_WAGER_MIN}–${GUESS_WAGER_MAX} 💎. Win and it comes back doubled; lose and it's gone, along with your streak.`],
        ['⚔️ With friends', `\`/guess duel\` · one image, first correct answer takes both stakes. Streaks are safe.\n\`/guess gift\` · send up to ${GUESS_GIFT_DAILY_MAX} 💎 a day, no fee. Needs ${GUESS_GIFT_MIN_WINS} wins.`],
        ['🏆 Seasons', 'Each quarter (Pacific time) the season leaderboard starts over, and the top 3 earn a 🥇🥈🥉 title.'],
        ['🛒 Shop', '`/guess shop` sells Streak Shields and crystal boosts. `/guess inventory` shows what you hold and starts boosts.'],
    ];
    const embed = styledEmbed({
        title: '🎯 How Guess That Anime works',
        description: sections.map(([name, text]) => `**${name}**\n${text}`).join('\n\n'),
        label: 'guess',
    });
    return { embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() };
}

async function showAbout(interaction) {
    await defer(interaction, { ephemeral: true });
    return finish(interaction, aboutPayload());
}

module.exports = { aboutPayload, showAbout };
