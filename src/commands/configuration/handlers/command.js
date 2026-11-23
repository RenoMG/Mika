const { openPanel } = require('./panel');

module.exports = function command(interaction) {
    return openPanel(interaction, 'command');
};
