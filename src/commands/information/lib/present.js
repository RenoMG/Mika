const { footer: styleFooter, formatNumber } = require('../../../utils/style');

function footer(label, ...extra) {
    return styleFooter(label, ...extra);
}

module.exports = { footer, formatNumber };
