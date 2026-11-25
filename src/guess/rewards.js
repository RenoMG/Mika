const { GUESS_CRYSTALS } = require('./constants');

const pacificDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short',
});

function crystalMultiplier(manual, now = Date.now()) {
    return manual && ['Fri', 'Sat', 'Sun'].includes(pacificDay.format(now)) ? 2 : 1;
}

// Each hint (up to three) takes 25% off the base reward and the wager profit.
function hintFactor(round = {}) {
    const hints = Math.min(3, Math.max(0, round.purchasedHints?.size || 0));
    return 1 - hints * 0.25;
}

function crystalReward(round = {}) {
    return Math.floor(GUESS_CRYSTALS * (round.crystalMultiplier === 2 ? 2 : 1) * hintFactor(round));
}

function wagerStake(round = {}) {
    return Number.isSafeInteger(round.wager) && round.wager > 0 ? round.wager : 0;
}

// A won wager returns the stake plus a profit equal to the stake, cut by hints.
function wagerReturn(round = {}) {
    const stake = wagerStake(round);
    return stake ? stake + Math.floor(stake * hintFactor(round)) : 0;
}

function winTotal(round = {}) {
    return crystalReward(round) + wagerReturn(round);
}

function rewardLabel(round = {}) {
    const base = `**${crystalReward(round)}** 💎${round.crystalMultiplier === 2 ? ' (weekend ×2)' : ''}`;
    const stake = wagerStake(round);
    return stake ? `${base} + **${wagerReturn(round)}** 💎 back from your **${stake}** 💎 wager` : base;
}

module.exports = { crystalMultiplier, crystalReward, hintFactor, wagerStake, wagerReturn, winTotal, rewardLabel };
