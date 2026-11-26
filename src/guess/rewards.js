const { GUESS_CRYSTALS } = require('./constants');
const { tierOf } = require('./difficulty');

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

// A difficulty tier sets the base reward; Normal pays the standard amount.
function baseCrystals(round = {}) {
    return tierOf(round.difficulty?.id)?.crystals || GUESS_CRYSTALS;
}

function crystalReward(round = {}) {
    return Math.floor(baseCrystals(round) * (round.crystalMultiplier === 2 ? 2 : 1) * hintFactor(round));
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

// The full win amount, with a tag when the base reward is doubled.
function rewardLabel(round = {}) {
    const tag = round.crystalMultiplier === 2 ? (round.boosted ? ' (boost ×2)' : ' (weekend ×2)') : '';
    return `**${winTotal(round)}** 💎${tag}`;
}

module.exports = { baseCrystals, crystalMultiplier, crystalReward, hintFactor, wagerStake, wagerReturn, winTotal, rewardLabel };
