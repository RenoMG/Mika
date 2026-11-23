const { openPanel } = require('./panel');

module.exports = function autorole(interaction) {
    return openPanel(interaction, 'autorole');
};
