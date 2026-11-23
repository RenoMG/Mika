const { openPanel } = require('./panel');

module.exports = function logging(interaction) {
    return openPanel(interaction, 'logging');
};
