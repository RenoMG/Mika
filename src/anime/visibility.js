// Profile visibility, shown to people as Local or Global. The stored field is
// still `discoverable` (true = Global), so no data migration is needed.
const LOCAL = 'local';
const GLOBAL = 'global';

const VISIBILITY_HELP = Object.freeze({
    local: 'Only people who share a server with you can open or find it.',
    global: 'Anyone using Mika can find it with /findprofile, even without a shared server.',
});

function isGlobal(profile) {
    return Boolean(profile && profile.discoverable === true);
}

function visibilityLabel(profile) {
    return isGlobal(profile) ? '🌐 Global' : '🏠 Local';
}

// The slash option value, or null when it was not given or is unknown.
function parseVisibility(value) {
    if (value === GLOBAL) return true;
    if (value === LOCAL) return false;
    return null;
}

function addVisibilityOption(builder, { required }) {
    return builder.addStringOption((option) => option
        .setName('visibility')
        .setDescription('Local: only people in your servers. Global: anyone using Mika.')
        .setRequired(required)
        .addChoices(
            { name: 'Local (people in your servers)', value: LOCAL },
            { name: 'Global (anyone using Mika)', value: GLOBAL },
        ));
}

module.exports = {
    LOCAL,
    GLOBAL,
    VISIBILITY_HELP,
    isGlobal,
    visibilityLabel,
    parseVisibility,
    addVisibilityOption,
};
