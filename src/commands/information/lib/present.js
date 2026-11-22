function footer(text) {
    return { text, iconURL: process.env.MIKAICON };
}

function formatNumber(num) {
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
}

module.exports = { footer, formatNumber };
