const { COLORS } = require('../../../utils/style');

// A member with no colored role reports 0 (#000000), which shows as a black
// stripe. Fall back to the brand color.
function memberColor(member) {
    const color = member && Number(member.displayColor);
    return Number.isFinite(color) && color > 0 ? color : COLORS.primary;
}

module.exports = { memberColor };
