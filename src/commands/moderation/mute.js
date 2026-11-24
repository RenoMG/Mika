const { applyMute } = require('../../utils/mutes');
const { roleAssignmentError } = require('../../utils/roles');
const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { getGuildConfig } = require('../../utils/getGuildConfig');
const { redact } = require('../../utils/redact');
const mod = require('../../utils/moderation');

// Role mute, not a Discord timeout. Lengths are the only values the command accepts.
const MUTE_MS = {
    '1800s': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
};

function firstRoleId(list) {
    if (!Array.isArray(list)) return '';
    for (const entry of list) {
        if (entry && typeof entry.Role === 'string' && entry.Role) return entry.Role;
    }
    return '';
}

async function muteRole(interaction, readConfig = getGuildConfig) {
    const config = await readConfig(interaction.guild.id);
    const roleId = firstRoleId(config.Muterole);
    if (!roleId) return { error: 'No mute role is set. Set one with /config muterole.' };
    const role = interaction.guild.roles.cache.get(roleId)
        || (typeof interaction.guild.roles.fetch === 'function' ? await interaction.guild.roles.fetch(roleId).catch(() => null) : null);
    if (!role) return { error: 'The mute role is missing. Set it again with /config muterole.' };
    const me = interaction.guild.members.me;
    if (!me || !me.permissions.has(PermissionFlagsBits.ManageRoles)) return { error: mod.HIERARCHY.botPermission };
    const botPosition = me.roles && me.roles.highest ? me.roles.highest.position : 0;
    if (role.position >= botPosition) {
        return { error: "I can't assign that mute role because it is at or above my highest role." };
    }
    const error = roleAssignmentError(interaction.guild, role, interaction.member);
    return error ? { error } : { role };
}

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
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/mute target:@user reason:spamming',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.ManageRoles],
    async execute(interaction, _client, deps = {}) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.ManageRoles);
            if (block) return finishReply(interaction, mod.ephemeral(block));
            const parsed = mod.reasonFrom(interaction.options.getString('reason'));
            if (parsed.error) return finishReply(interaction, mod.ephemeral(parsed.error));
            const time = interaction.options.getString('time');
            if (time && !Object.prototype.hasOwnProperty.call(MUTE_MS, time)) {
                return finishReply(interaction, mod.ephemeral('That mute length is not allowed.'));
            }
            await mod.hold(interaction);
            const resolved = await muteRole(interaction, deps.getGuildConfig);
            if (resolved.error) return mod.answer(interaction, mod.ephemeral(resolved.error));

            const reason = parsed.reason;
            await applyMute(target, resolved.role.id, time ? MUTE_MS[time] : null);

            const doc = await mod.pushInfraction(interaction.guildId, target.id, 'Mutes', mod.actorEntry(interaction, reason));
            const shown = time || 'until /unmute';
            await mod.sendModLog(interaction, {
                color: mod.Colors.Yellow,
                title: 'MUTE',
                thumbnail: target.displayAvatarURL(),
                description: `**${target.user.username}** has been muted!`,
                lines: `• Muted by: ${interaction.user.tag}
                • ID: ${target.id}
                • Muted for: ${shown}
                • Reason: ${reason}
                • Current number of mutes: ${(doc.Mutes || []).length}`,
                mentionIds: [target.id, interaction.user.id],
            });
            return mod.answer(interaction, mod.embedReply(
                mod.Colors.Yellow,
                `✅ **${target.user.username}** has been muted! ${shown} | ${target.id}\n**Reason**: ${reason}`,
                'Mika | 🤫 mute',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Mute failed.');
        }
    },
};
