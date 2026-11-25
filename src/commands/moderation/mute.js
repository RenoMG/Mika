const { applyMute } = require('../../utils/mutes');
const { roleAssignmentError } = require('../../utils/roles');
const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { getGuildConfig } = require('../../utils/getGuildConfig');
const { redact } = require('../../utils/redact');
const mod = require('../../utils/moderation');
const { firstValue } = require('../../utils/configStatus');

// Role mute, not a Discord timeout. Lengths are the only values the command accepts.
const MUTE_MS = {
    '1800s': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
};


async function muteRole(interaction, readConfig = getGuildConfig) {
    const config = await readConfig(interaction.guild.id);
    const roleId = firstValue(config, 'Muterole', 'Role');
    if (!roleId) return { error: 'No mute role is set. Set one with /config section:Roles.' };
    const role = interaction.guild.roles.cache.get(roleId)
        || (typeof interaction.guild.roles.fetch === 'function' ? await interaction.guild.roles.fetch(roleId).catch(() => null) : null);
    if (!role) return { error: 'The mute role is missing. Set it again with /config section:Roles.' };
    const me = interaction.guild.members.me;
    if (!me || !me.permissions.has(PermissionFlagsBits.ManageRoles)) return { error: mod.HIERARCHY.botPermission };
    // roleAssignmentError also checks the role sits below the bot and the moderator.
    const error = roleAssignmentError(interaction.guild, role, interaction.member);
    return error ? { error } : { role };
}

function check(interaction) {
    const checked = mod.targetAndReason(interaction, PermissionFlagsBits.ManageRoles);
    if (checked.error) return checked;
    const time = interaction.options.getString('time');
    if (time && !Object.prototype.hasOwnProperty.call(MUTE_MS, time)) return { error: 'That mute length is not allowed.' };
    return { ...checked, time };
}

const DURATION_LABELS = { '1800s': '30 minutes', '1h': '1 hour', '1d': '1 day', '7d': '1 week' };

module.exports = {
    MUTE_MS,
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mutes a member with the configured mute role.')
        .addUserOption((option) => option.setName('target').setDescription('Member to mute.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the mute.').setRequired(true).setMaxLength(mod.REASON_MAX))
        .addStringOption((option) => option.setName('time').setDescription('How long to mute them. Leave this out to mute until /unmute.')
            .addChoices(
                { name: '30 minutes', value: '1800s' },
                { name: '1 hour', value: '1h' },
                { name: '1 day', value: '1d' },
                { name: '1 week', value: '7d' },
            )),
        PermissionFlagsBits.ModerateMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/mute target:@user reason:spamming',
    permissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ManageRoles],
    precheck: (interaction) => check(interaction).error || null,
    async execute(interaction, _client, deps = {}) {
        try {
            const checked = check(interaction);
            if (checked.error) return finishReply(interaction, mod.ephemeral(checked.error));
            const { target, time } = checked;
            await mod.defer(interaction);
            const resolved = await muteRole(interaction, deps.getGuildConfig);
            if (resolved.error) return mod.finish(interaction, mod.ephemeral(resolved.error));

            const reason = checked.reason;
            await applyMute(target, resolved.role.id, time ? MUTE_MS[time] : null);

            const shown = DURATION_LABELS[time] || 'Until /unmute';
            const record = await mod.followThrough('Mute record failed.', async () => {
                const doc = await mod.pushInfraction(interaction.guildId, target.id, 'Mutes', mod.actorEntry(interaction, reason));
                await mod.sendModLog(interaction, {
                    color: 'warning',
                    title: '🔇 Member muted',
                    thumbnail: target.displayAvatarURL(),
                    targetId: target.id,
                    fields: [
                        { name: 'Duration', value: shown },
                        { name: 'Total mutes', value: String((doc.Mutes || []).length) },
                        { name: 'Reason', value: reason, inline: false },
                    ],
                    mentionIds: [target.id, interaction.user.id],
                });
            });
            const text = mod.actionText('✅', time ? `<@${target.id}> was muted for **${shown}**.` : `<@${target.id}> was muted until /unmute.`, reason);
            return mod.finish(interaction, mod.embedReply(
                'warning',
                record.failed ? `${text}\n${mod.RECORD_FAILED}` : text,
                'mute',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Mute failed.');
        }
    },
};
