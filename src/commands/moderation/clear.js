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
        .setDescription('Clears messages.')
        .addIntegerOption((option) => option.setName('amount').setDescription('How many messages to clear (1-100).').setRequired(true).setMinValue(1).setMaxValue(100))
        .addUserOption((option) => option.setName('target').setDescription('Only delete messages from this member.')),
        PermissionFlagsBits.ManageMessages),
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/clear amount:5',
    permissions: [PermissionFlagsBits.ManageMessages],
    botPermissions: [PermissionFlagsBits.ManageMessages],
    async execute(interaction) {
        try {
            const amount = interaction.options.getInteger('amount');
            if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
                return finishReply(interaction, mod.ephemeral('Amount must be from 1 to 100.'));
            }
            const target = interaction.options.getMember('target');
            if (target && target.id !== interaction.user.id) {
                const block = hierarchyBlock({
                    guild: interaction.guild,
                    invoker: interaction.member,
                    target,
                    botMember: interaction.guild.members.me,
                });
                if (block) return finishReply(interaction, mod.ephemeral(block));
            }
            const me = interaction.guild.members.me;
            if (!me || !me.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return finishReply(interaction, mod.ephemeral(mod.HIERARCHY.botPermission));
            }

            await mod.hold(interaction);
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            let deleted;
            if (target) {
                const filtered = [];
                for (const message of messages.values()) {
                    if (message.author.id === target.id && filtered.length < amount) filtered.push(message);
                }
                deleted = await interaction.channel.bulkDelete(filtered, true);
            } else {
                deleted = await interaction.channel.bulkDelete(amount, true);
            }
            const count = plural(deleted.size, 'message');
            const description = target
                ? `🧹 Cleared **${count}** from ${target}.`
                : `🧹 Cleared **${count}**.`;
            const skipped = amount - deleted.size;
            const note = skipped > 0 && !target ? '\nMessages older than 14 days can\'t be bulk deleted.' : '';
            const response = styledEmbed({ color: 'success', description: `${description}${note}`, label: 'clear' });
            return mod.answer(interaction, {
                embeds: [response],
                allowedMentions: allowedMentions(target && target.id),
            });
        } catch (error) {
            return mod.replyError(interaction, error, 'Clear failed.');
        }
    },
};
