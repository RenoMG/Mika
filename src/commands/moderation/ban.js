const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member or user to ban. Works for people who are not in the server.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the ban.').setRequired(true).setMaxLength(mod.REASON_MAX))
        .addStringOption((option) => option.setName('messages').setDescription('How much recent message history to delete.').setRequired(true)
            .addChoices({ name: "Don't delete any", value: '0' }, { name: 'Previous 7 days', value: '7' })),
        PermissionFlagsBits.BanMembers),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/ban target:@user reason:spamming messages:Don\'t delete any',
    permissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers],
    precheck: (interaction) => check(interaction).error || null,
    async execute(interaction) {
        try {
            const checked = check(interaction);
            if (checked.error) return finishReply(interaction, mod.ephemeral(checked.error));
            const { user, member, reason, days } = checked;

            await mod.defer(interaction);
            const options = { deleteMessageSeconds: Number(days) * 24 * 60 * 60, reason };
            // A member is banned through the member; anyone else by user id.
            if (member) await member.ban(options);
            else await interaction.guild.bans.create(user.id, options);

            const record = await mod.followThrough('Ban record failed.', async () => {
                const doc = await mod.pushInfraction(interaction.guildId, user.id, 'Bans', mod.actorEntry(interaction, reason));
                await mod.sendModLog(interaction, {
                    color: 'danger',
                    title: member ? '🔨 Member banned' : '🔨 User banned',
                    thumbnail: avatarOf(member || user),
                    targetId: user.id,
                    fields: [
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Total bans', value: String((doc.Bans || []).length) },
                    ],
                    mentionIds: [user.id, interaction.user.id],
                });
            });
            const text = mod.actionText('✅', `<@${user.id}> was banned.`, reason);
            return mod.finish(interaction, mod.embedReply(
                'danger',
                record.failed ? `${text}\n${mod.RECORD_FAILED}` : text,
                'ban',
                [user.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Ban failed.');
        }
    },
};

function avatarOf(holder) {
    return holder && typeof holder.displayAvatarURL === 'function' ? holder.displayAvatarURL() : null;
}

// Members get the full hierarchy check. Someone who is not in the server has
// no roles, so only "not yourself, not me, not the owner" applies.
function check(interaction) {
    const member = interaction.options.getMember('target');
    const user = (member && member.user) || interaction.options.getUser('target');
    if (member) {
        const block = mod.guardMember(interaction, member, PermissionFlagsBits.BanMembers);
        if (block) return { error: block };
    } else {
        if (!user || !user.id) return { error: mod.HIERARCHY.missing };
        if (user.id === interaction.user.id) return { error: mod.HIERARCHY.self };
        if (user.id === interaction.guild.ownerId) return { error: mod.HIERARCHY.owner };
        const me = interaction.guild.members && interaction.guild.members.me;
        if (me && user.id === me.id) return { error: mod.HIERARCHY.botRole };
        if (!me || !me.permissions || !me.permissions.has(PermissionFlagsBits.BanMembers)) return { error: mod.HIERARCHY.botPermission };
    }
    const parsed = mod.reasonFrom(interaction.options.getString('reason'));
    if (parsed.error) return { error: parsed.error };
    const days = interaction.options.getString('messages');
    if (days !== '0' && days !== '7') return { error: 'Choose how many days of messages to delete.' };
    return { user, member, reason: parsed.reason, days };
}
