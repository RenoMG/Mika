const { InteractionContextType } = require('discord.js');

// Guild-only slash commands. discord.js 14 exposes setContexts; older builders used setDMPermission.
function applySlashDefaults(builder, defaultMemberPermissions) {
    if (typeof builder.setContexts === 'function' && InteractionContextType) {
        builder.setContexts(InteractionContextType.Guild);
    } else if (typeof builder.setDMPermission === 'function') {
        builder.setDMPermission(false);
    }

    if (defaultMemberPermissions != null) {
        builder.setDefaultMemberPermissions(defaultMemberPermissions);
    }

    return builder;
}

module.exports = { applySlashDefaults };
