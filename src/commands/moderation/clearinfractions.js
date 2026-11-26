const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

function check(interaction) {
    const target = mod.recordTarget(interaction);
    if (target.error) return target;
    const value = interaction.options.getString('type');
    const type = value == null ? null : mod.recordTypeOf(value);
    if (value != null && !type) return { error: 'Choose warning, mute, kick, or ban.' };
    return { ...target, type };
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('clearinfractions')
        .setDescription("Clears a member's whole record, or every record of one type.")
        .addUserOption((option) => option.setName('target').setDescription('Member or user whose record to clear. Works for people who left.').setRequired(true))
        .addStringOption((option) => option.setName('type').setDescription('Only clear this kind of record. Leave this out to clear everything.')
            .addChoices(...mod.TYPE_CHOICES)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/clearinfractions target:@user type:Warning',
    note: 'Clearing is permanent and is posted to the mod log.',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [],
    precheck: (interaction) => check(interaction).error || null,
    async execute(interaction) {
        try {
            const checked = check(interaction);
            if (checked.error) return finishReply(interaction, mod.ephemeral(checked.error));
            const { user, type } = checked;
            const guild = mod.snowflake(interaction.guildId);
            const userId = mod.snowflake(user.id);
            if (!guild || !userId) return finishReply(interaction, mod.ephemeral('That user id is not valid.'));

            await mod.defer(interaction);
            const doc = await mod.infractionsDB.findOne({ GuildID: guild, UserID: userId });
            const before = mod.recordSummary(doc);
            const empty = type ? !mod.recordsOf(doc, type.key).length : before === 'Clean';
            if (empty) {
                const what = type ? type.many : 'infractions';
                return mod.finish(interaction, mod.embedReply('primary', `<@${user.id}> has no ${what}.`, 'infractions', [user.id]));
            }

            let cleared;
            if (type) {
                cleared = `${mod.recordsOf(doc, type.key).length} ${type.many}`;
                doc[type.key] = [];
                doc.markModified(type.key);
                await doc.save();
            } else {
                cleared = before;
                await mod.infractionsDB.deleteOne({ GuildID: guild, UserID: userId });
            }
            const outcome = await mod.logAction(interaction, {
                color: 'primary',
                title: '🧹 Infractions cleared',
                user,
                fields: [
                    { name: 'Cleared', value: cleared },
                    { name: 'Record', value: type ? mod.recordSummary(doc) : 'Clean' },
                ],
            });
            const text = type
                ? `Cleared all ${type.many} for <@${user.id}>.`
                : `Cleared every infraction for <@${user.id}>.`;
            return mod.actionReply(interaction, {
                color: 'success',
                text: mod.actionText('✅', text),
                label: 'infractions',
                mentionIds: [user.id],
                outcome,
            });
        } catch (error) {
            return mod.replyError(interaction, error, 'Clear infractions failed.');
        }
    },
};
