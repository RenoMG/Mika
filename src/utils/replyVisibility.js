// Who sees a command's reply. One rule for every command:
//
//   Public  — showing something people may want to share: profiles, lists,
//             stats, rank cards, leaderboards, search results, and the record
//             of a moderation action.
//   Private — changing your own data or settings, personal menus, server
//             configuration, and lookups of someone's moderation history.
//             Errors and confirmations of a private action are private too.
//
// Each command declares `replies: 'public' | 'private'`, and may override it per
// subcommand with `subcommandReplies`. The first acknowledgement uses this, so a
// reply never flashes publicly before turning private.
const PUBLIC = 'public';
const PRIVATE = 'private';

function subcommandOf(interaction) {
    const options = interaction && interaction.options;
    if (!options || typeof options.getSubcommand !== 'function') return null;
    try {
        return options.getSubcommand(false) || null;
    } catch (error) {
        return null;
    }
}

function groupOf(interaction) {
    const options = interaction && interaction.options;
    if (!options || typeof options.getSubcommandGroup !== 'function') return null;
    try {
        return options.getSubcommandGroup(false) || null;
    } catch (error) {
        return null;
    }
}

function replyMode(command, interaction) {
    if (!command) return PRIVATE;
    const overrides = command.subcommandReplies || {};
    const sub = subcommandOf(interaction);
    const group = groupOf(interaction);
    const keys = [group && sub ? `${group} ${sub}` : null, sub, group].filter(Boolean);
    for (const key of keys) {
        if (overrides[key] === PUBLIC || overrides[key] === PRIVATE) return overrides[key];
    }
    return command.replies === PRIVATE ? PRIVATE : PUBLIC;
}

function replyIsPrivate(command, interaction) {
    return replyMode(command, interaction) === PRIVATE;
}

module.exports = { PUBLIC, PRIVATE, replyMode, replyIsPrivate };
