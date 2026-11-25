const { firstValue, isOn, isOff } = require('../utils/configStatus');
const { snowflake } = require('../utils/safeId');
const {
    GUESS_INTERVAL_DEFAULT,
    GUESS_INTERVAL_MAX,
    GUESS_INTERVAL_MIN,
} = require('./constants');

// The whole game can be switched off in /config. Auto-drops stop with it.
function guessGameEnabled(config) {
    return !isOff(config, 'GuessCommandStatus');
}

function guessEnabled(config) {
    return isOn(config, 'GuessStatus') && guessGameEnabled(config);
}

function guessChannel(config) {
    return snowflake(firstValue(config, 'GuessChannel', 'Channel'));
}

function intervalMinutes(config) {
    const text = firstValue(config, 'GuessInterval', 'Minutes').trim();
    if (!/^\d{1,4}$/.test(text)) return GUESS_INTERVAL_DEFAULT;
    const minutes = Number(text);
    if (minutes < GUESS_INTERVAL_MIN || minutes > GUESS_INTERVAL_MAX) return GUESS_INTERVAL_DEFAULT;
    return minutes;
}

module.exports = {
    guessGameEnabled,
    guessEnabled,
    guessChannel,
    intervalMinutes,
};
