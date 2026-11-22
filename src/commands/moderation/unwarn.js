const {
    ActionRowBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { redact } = require('../../utils/redact');
const mod = require('../../utils/moderation');

const PICK_ID = 'unwarn:pick';
const TIMEOUT_MS = 120000;
const ONLY = 'Only the person who used /unwarn can use this menu.';

function listOf(doc) {
    return doc && Array.isArray(doc.Content) ? doc.Content : [];
}

async function removeAt(guildId, userId, index) {
    const warns = await mod.findByMember(mod.warnDB, guildId, userId);
    const content = listOf(warns);
    if (!warns || index < 0 || index >= content.length) return { error: 'That warn id is not on their list.' };
    content.splice(index, 1);
    warns.Content = content;
    await warns.save();
    const infra = await mod.findByMember(mod.infractionsDB, guildId, userId);
    if (infra && Array.isArray(infra.Warns) && index < infra.Warns.length) {
        infra.Warns.splice(index, 1);
        await infra.save();
    }
    return { id: index + 1 };
}

function optionLabel(entry, index) {
    const reason = String(entry && entry.Reason ? entry.Reason : 'No reason').replace(/\s+/g, ' ').trim();
    return `${index + 1}. ${reason || 'No reason'}`.slice(0, 100);
}

async function presentPicker(interaction, target, entries) {
    const shown = entries.slice(0, 25);
    const menu = new StringSelectMenuBuilder()
        .setCustomId(PICK_ID)
        .setPlaceholder('Choose a warning')
        .addOptions(shown.map((entry, index) => ({
            label: optionLabel(entry, index),
            value: String(index + 1),
            description: `Id ${index + 1}`.slice(0, 100),
        })));
    const extra = entries.length > shown.length
        ? `\n\nThe menu lists the first ${shown.length}. Pass an id for a later warning.`
        : '';
    const response = await interaction.reply({
        content: `Pick a warning to remove from **${target.user.username}**.${extra}`,
        components: [new ActionRowBuilder().addComponents(menu)],
        allowedMentions: mod.allowedMentions(target.id),
        withResponse: true,
    });
    const message = response && response.resource && response.resource.message
        ? response.resource.message
        : (typeof interaction.fetchReply === 'function' ? await interaction.fetchReply() : null);
    if (!message || typeof message.createMessageComponentCollector !== 'function') return response;

    const collector = message.createMessageComponentCollector({ time: TIMEOUT_MS });
    collector.on('collect', async (component) => {
        try {
            if (!component.user || component.user.id !== interaction.user.id) {
                await component.reply({ content: ONLY, flags: MessageFlags.Ephemeral });
                return;
            }
            const id = mod.positiveInteger(component.values && component.values[0]);
            if (!id) return;
            const member = interaction.options.getMember('target') || target;
            const block = mod.guardMember(interaction, member, PermissionFlagsBits.KickMembers);
            if (block) {
                await component.reply({ content: block, flags: MessageFlags.Ephemeral });
                return;
            }
            const result = await removeAt(interaction.guildId, member.id, id - 1);
            if (result.error) {
                await component.reply({ content: result.error, flags: MessageFlags.Ephemeral });
                return;
            }
            await component.update({
                content: `Removed warning **${result.id}** from **${member.user.username}**.`,
                components: [],
                allowedMentions: mod.allowedMentions(member.id),
            });
            collector.stop('done');
        } catch (error) {
            console.error('Unwarn selection failed.', redact(error));
            if (!component.replied && !component.deferred) {
                await component.reply({ content: mod.GENERIC_ERROR, flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    });
    collector.on('end', async (_collected, reason) => {
        if (reason === 'done') return;
        try {
            const row = new ActionRowBuilder().addComponents(StringSelectMenuBuilder.from(menu).setDisabled(true));
            await interaction.editReply({ components: [row] });
        } catch (error) {
            // The message can already be gone when the collector ends.
        }
    });
    return response;
}

module.exports = {
    PICK_ID,
    TIMEOUT_MS,
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('Removes one warning from a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member whose warning to remove.').setRequired(true))
        .addIntegerOption((option) => option.setName('id').setDescription('Warn id from /infractions. Leave this out to pick from a menu.').setMinValue(1).setMaxValue(mod.WARN_ID_MAX)),
        PermissionFlagsBits.KickMembers),
    category: 'moderation',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/unwarn target:@user id:1',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers],
    async execute(interaction) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.KickMembers);
            if (block) return interaction.reply(mod.ephemeral(block));
            const warns = await mod.findByMember(mod.warnDB, interaction.guildId, target.id);
            const entries = listOf(warns);
            if (!entries.length) {
                return interaction.reply(mod.embedReply(
                    mod.Colors.Blue,
                    `${target.user.tag} | ${target.id} | Has no warnings.`,
                    'Mika | ⚠️ warn',
                    [target.id],
                ));
            }
            const id = interaction.options.getInteger('id');
            if (id == null) return presentPicker(interaction, target, entries);
            const parsed = mod.positiveInteger(id);
            if (!parsed) return interaction.reply(mod.ephemeral('That warn id is not valid.'));
            const result = await removeAt(interaction.guildId, target.id, parsed - 1);
            if (result.error) return interaction.reply(mod.ephemeral(result.error));
            return interaction.reply(mod.embedReply(
                mod.Colors.Green,
                `${target.user.tag}'s warning id: ${result.id} has been removed.`,
                'Mika | ⚠️ warn',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Unwarn failed.');
        }
    },
};
