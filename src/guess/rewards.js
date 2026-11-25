const { GUESS_CRYSTALS } = require('./constants');

const pacificDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short',
});

function crystalMultiplier(manual, now = Date.now()) {
    return manual && ['Fri', 'Sat', 'Sun'].includes(pacificDay.format(now)) ? 2 : 1;
}

function crystalReward(round = {}) {
    const hints = Math.min(3, Math.max(0, round.purchasedHints?.size || 0));
    return Math.floor(GUESS_CRYSTALS * (round.crystalMultiplier === 2 ? 2 : 1) * (1 - hints * 0.25));
}

function rewardLabel(round = {}) {
    return `**${crystalReward(round)}** 💎${round.crystalMultiplier === 2 ? ' (weekend ×2)' : ''}`;
}

module.exports = { crystalMultiplier, crystalReward, rewardLabel };
