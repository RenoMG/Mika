const { listValues, statusText } = require('../commands/configuration/handlers/configFields');
const { snowflake } = require('../utils/safeId');
const {
    GUESS_INTERVAL_DEFAULT,
    GUESS_INTERVAL_MAX,
    GUESS_INTERVAL_MIN,
} = require('./constants');

function guessEnabled(config) {
    return statusText(config && config.GuessStatus) === 'true';
}

function guessChannel(config) {
    const values = listValues(config && config.GuessChannel, 'Channel');
    return snowflake(values[0]);
}

function intervalMinutes(config) {
    const values = listValues(config && config.GuessInterval, 'Minutes');
    const text = values.length ? String(values[0]).trim() : '';
    if (!/^\d{1,2}$/.test(text)) return GUESS_INTERVAL_DEFAULT;
    const minutes = Number(text);
    if (minutes < GUESS_INTERVAL_MIN || minutes > GUESS_INTERVAL_MAX) return GUESS_INTERVAL_DEFAULT;
    return minutes;
}

module.exports = {
    guessEnabled,
    guessChannel,
    intervalMinutes,
};
