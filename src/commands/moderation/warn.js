const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

// A warning is only a record, so the bot needs no Discord permission and its
// own role position doesn't matter. The member still has to be in the server.
function checkTarget(interaction, member) {
    if (!member) return mod.HIERARCHY.missing;
    return mod.recordGuard(interaction, member.user || member, member);
}

function check(interaction) {
    const member = interaction.options.getMember('target');
    const block = checkTarget(interaction, member);
    if (block) return { error: block };
    const parsed = mod.reasonFrom(interaction.options.getString('reason'));
    if (parsed.error) return { error: parsed.error };
    return { target: member, reason: parsed.reason };
}

// Shared with the Warn app (right-click a member). The interaction is already
// acknowledged.
async function warnMember(interaction, target, reason) {
    const outcome = await mod.recordAction(interaction, {
        type: 'warn', user: target, reason, color: 'warning', title: '⚠️ Member warned', recordIsAction: true,
    });
    return mod.actionReply(interaction, {
        color: 'warning',
        text: mod.actionText('✅', `<@${target.id}> was warned.`, reason),
        label: 'warn',
        mentionIds: [target.id],
        outcome,
    });
}

module.exports = {
    checkTarget,
    warnMember,
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warns a member and adds it to their record.')
        .addUserOption((option) => option.setName('target').setDescription('Member to warn.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the warning.').setRequired(true).setMaxLength(mod.REASON_MAX)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/warn target:@user reason:spamming',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [],
    precheck: (interaction) => check(interaction).error || null,
    async execute(interaction) {
        try {
            const checked = check(interaction);
            if (checked.error) return finishReply(interaction, mod.ephemeral(checked.error));
            await mod.defer(interaction);
            return await warnMember(interaction, checked.target, checked.reason);
        } catch (error) {
            return mod.replyError(interaction, error, 'Warn failed.');
        }
    },
};
