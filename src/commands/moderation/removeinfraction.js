const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const mod = require('../../utils/moderation');

const TYPES = {
    kick: { key: 'Kicks', label: 'kick' },
    mute: { key: 'Mutes', label: 'mute' },
    ban: { key: 'Bans', label: 'ban' },
};

module.exports = {
    TYPES,
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('removeinfraction')
        .setDescription('Removes one kick, mute, or ban record.')
        .addUserOption((option) => option.setName('target').setDescription('Member whose record to remove.').setRequired(true))
        .addStringOption((option) => option.setName('type').setDescription('Which record to remove.').setRequired(true)
            .addChoices(
                { name: 'Kick', value: 'kick' },
                { name: 'Mute', value: 'mute' },
                { name: 'Ban', value: 'ban' },
            ))
        .addIntegerOption((option) => option.setName('id').setDescription('Record id from /infractions.').setRequired(true).setMinValue(1).setMaxValue(mod.WARN_ID_MAX)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/removeinfraction target:@user type:Kick id:1',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers],
    async execute(interaction) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.KickMembers);
            if (block) return interaction.reply(mod.ephemeral(block));
            const type = TYPES[interaction.options.getString('type')];
            if (!type) return interaction.reply(mod.ephemeral('Choose kick, mute, or ban.'));
            const id = mod.positiveInteger(interaction.options.getInteger('id'));
            if (!id) return interaction.reply(mod.ephemeral('That id is not valid.'));

            await mod.hold(interaction);
            const doc = await mod.findByMember(mod.infractionsDB, interaction.guildId, target.id);
            const list = doc && Array.isArray(doc[type.key]) ? doc[type.key] : [];
            if (!list.length) {
                return mod.answer(interaction, mod.embedReply(
                    mod.Colors.Blue,
                    `${target.user.tag} | ${target.id} | Has no ${type.label}s.`,
                    'Mika | 📜 infractions',
                    [target.id],
                ));
            }
            if (id > list.length) return mod.answer(interaction, mod.ephemeral('That id is not on their list.'));
            list.splice(id - 1, 1);
            doc[type.key] = list;
            await doc.save();
            return mod.answer(interaction, mod.embedReply(
                mod.Colors.Green,
                `${target.user.tag}'s ${type.label} id: ${id} has been removed.`,
                'Mika | 📜 infractions',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Remove infraction failed.');
        }
    },
};
