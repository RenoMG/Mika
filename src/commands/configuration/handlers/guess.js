const { openPanel } = require('./panel');

module.exports = function guess(interaction) {
    return openPanel(interaction, 'guess');
};
