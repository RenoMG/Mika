const { openPanel } = require('./panel');

module.exports = function welcome(interaction) {
    return openPanel(interaction, 'welcome');
};
