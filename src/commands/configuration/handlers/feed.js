const { openPanel } = require('./panel');

module.exports = function feed(interaction) {
    return openPanel(interaction, 'feed');
};
