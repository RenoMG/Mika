const { defer, finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');
const menu = require('./menu/infractionsMenu');
const { removePicked } = require('./menu/recordPicker');

function typeForKey(key) {
    return Object.values(mod.RECORD_TYPES).find((type) => type.key === key) || null;
}

// Shared with the Infractions app (right-click a member). Moderators who may
// edit this record get a menu to remove entries from the view itself.
async function showInfractions(interaction, user, member) {
    const guild = mod.snowflake(interaction.guildId);
    const userId = mod.snowflake(user && user.id);
    if (!guild || !userId) return finishReply(interaction, mod.ephemeral('That user id is not valid.'));
    // A member's record is for the moderator, so the lookup is private.
    await defer(interaction, { ephemeral: true });
    const doc = await mod.infractionsDB.findOne({ GuildID: guild, UserID: userId });
    const editable = !mod.recordGuard(interaction, user, member);
    const remove = editable
        ? async ({ section, entry }) => {
            const type = typeForKey(section.key);
            const result = await removePicked(interaction, { user, member, type, expected: entry });
            if (result.error) return result;
            const note = result.outcome && result.outcome.note ? ` ${result.outcome.note}` : '';
            return { doc: result.doc, text: `✅ Removed ${type.one} **#${result.id}**.${note}` };
        }
        : null;
    return menu.presentInfractions(interaction, { user, doc, remove });
}

module.exports = {
    showInfractions,
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('infractions')
        .setDescription('Shows a member\'s warns, kicks, mutes, and bans.')
        .addUserOption((option) => option.setName('target').setDescription('Member to look up. Defaults to you.')),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    replies: 'private',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/infractions target:@user',
    note: 'Open a section to remove one of its records from the menu.',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [],
    async execute(interaction) {
        try {
            const member = interaction.options.getMember('target') || null;
            const user = (member && member.user) || interaction.options.getUser('target') || interaction.user;
            return await showInfractions(interaction, user, member);
        } catch (error) {
            return mod.replyError(interaction, error, 'Infractions failed.');
        }
    },
};
