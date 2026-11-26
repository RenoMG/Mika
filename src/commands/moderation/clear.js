const { finish: finishReply } = require('../../utils/ack');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { embed: styledEmbed, plural } = require('../../utils/style');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { allowedMentions } = require('../../utils/mentions');
const { hierarchyBlock } = require('../../utils/hierarchy');
const mod = require('../../utils/moderation');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Deletes recent messages in this channel, optionally from one member.')
        .addIntegerOption((option) => option.setName('amount').setDescription('How many messages to clear (1-100).').setRequired(true).setMinValue(1).setMaxValue(100))
        .addUserOption((option) => option.setName('target').setDescription('Only delete messages from this member.')),
        PermissionFlagsBits.ManageMessages),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/clear amount:20 target:@user',
    permissions: [PermissionFlagsBits.ManageMessages],
    botPermissions: [PermissionFlagsBits.ManageMessages],
    precheck: (interaction) => check(interaction).error || null,
    async execute(interaction) {
        try {
            const checked = check(interaction);
            if (checked.error) return finishReply(interaction, mod.ephemeral(checked.error));
            const { amount, target } = checked;

            await mod.defer(interaction);
            // The public "thinking" placeholder is the newest message in the channel.
            // Start below it so it is neither deleted nor counted toward the amount.
            const reply = typeof interaction.fetchReply === 'function'
                ? await interaction.fetchReply().catch(() => null)
                : null;
            const messages = await interaction.channel.messages.fetch(reply && reply.id
                ? { limit: 100, before: reply.id }
                : { limit: 100 });
            const own = (message) => (reply && message.id === reply.id)
                || message.interactionMetadata?.id === interaction.id;
            const picked = [...messages.values()]
                .filter((message) => !own(message) && (!target || message.author?.id === target.id))
                .slice(0, amount);
            const deleted = picked.length ? await interaction.channel.bulkDelete(picked, true) : new Map();
            const count = plural(deleted.size, 'message');
            const description = target
                ? `🧹 Cleared **${count}** from ${target}.`
                : `🧹 Cleared **${count}**.`;
            let note = '';
            if (deleted.size < picked.length) note = '\nMessages older than 14 days can\'t be bulk deleted.';
            else if (target && picked.length < amount) note = '\nOnly the last 100 messages are searched.';
            const response = styledEmbed({ color: 'success', description: `${description}${note}`, label: 'clear' });
            return mod.finish(interaction, {
                embeds: [response],
                allowedMentions: allowedMentions(target && target.id),
            });
        } catch (error) {
            return mod.replyError(interaction, error, 'Clear failed.');
        }
    },
};

function check(interaction) {
    const amount = interaction.options.getInteger('amount');
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) return { error: 'Amount must be from 1 to 100.' };
    const target = interaction.options.getMember('target');
    if (target && target.id !== interaction.user.id) {
        const block = hierarchyBlock({
            guild: interaction.guild,
            invoker: interaction.member,
            target,
            botMember: interaction.guild.members.me,
        });
        if (block) return { error: block };
    }
    const me = interaction.guild.members.me;
    if (!me || !me.permissions.has(PermissionFlagsBits.ManageMessages)) return { error: mod.HIERARCHY.botPermission };
    return { amount, target };
}
