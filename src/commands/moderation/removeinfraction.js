const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');
const picker = require('./menu/recordPicker');

function check(interaction) {
    const target = mod.recordTarget(interaction);
    if (target.error) return target;
    const type = mod.recordTypeOf(interaction.options.getString('type'));
    if (!type) return { error: 'Choose warning, mute, kick, or ban.' };
    const rawId = interaction.options.getInteger('id');
    const id = rawId == null ? null : mod.positiveInteger(rawId);
    if (rawId != null && !id) return { error: 'That id is not valid.' };
    return { ...target, type, id };
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('removeinfraction')
        .setDescription('Removes one warning, mute, kick, or ban from a record.')
        .addUserOption((option) => option.setName('target').setDescription('Member or user whose record to edit. Works for people who left.').setRequired(true))
        .addStringOption((option) => option.setName('type').setDescription('Which kind of record to remove.').setRequired(true)
            .addChoices(...mod.TYPE_CHOICES))
        .addIntegerOption((option) => option.setName('id').setDescription('Record id from /infractions. Leave this out to pick from a menu.').setMinValue(1).setMaxValue(mod.WARN_ID_MAX)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/removeinfraction target:@user type:Warning id:1',
    note: 'Leave out `id` to pick from a menu. Removing a record is posted to the mod log.',
    permissions: [PermissionFlagsBits.KickMembers],
    // Only Mika's own records change, so the bot needs no Discord permission.
    botPermissions: [],
    precheck: (interaction) => check(interaction).error || null,
    async execute(interaction) {
        try {
            const checked = check(interaction);
            if (checked.error) return finishReply(interaction, mod.ephemeral(checked.error));
            const { user, member, type, id } = checked;

            await mod.defer(interaction);
            const doc = await mod.findByMember(mod.infractionsDB, interaction.guildId, user.id);
            const list = mod.recordsOf(doc, type.key);
            if (!list.length) {
                return mod.finish(interaction, mod.embedReply('primary', `<@${user.id}> has no ${type.many}.`, 'infractions', [user.id]));
            }
            if (id == null) return picker.presentPicker(interaction, { user, member, type, entries: list });

            const result = await mod.removeRecord(doc, type.key, { index: id - 1 });
            if (result.error) return mod.finish(interaction, mod.ephemeral(result.error));
            const outcome = await mod.logAction(interaction, picker.removalLog(type, user, result));
            return mod.actionReply(interaction, {
                color: 'success',
                text: mod.actionText('✅', `Removed ${type.one} **#${result.id}** from <@${user.id}>.`),
                label: 'infractions',
                mentionIds: [user.id],
                outcome,
            });
        } catch (error) {
            return mod.replyError(interaction, error, 'Remove infraction failed.');
        }
    },
};
