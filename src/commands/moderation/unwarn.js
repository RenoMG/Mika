const { deferComponent, updateComponent } = require('../../utils/ack');
const { finish: finishReply } = require('../../utils/ack');
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

async function removeAt(guildId, userId, index, expected) {
    const warns = await mod.findByMember(mod.warnDB, guildId, userId);
    const content = listOf(warns);
    if (!warns || index < 0 || index >= content.length) return { error: 'That warn id is not on their list.' };
    if (expected) {
        const found = content.findIndex((entry) => expected.warningId ? entry.warningId === expected.warningId : JSON.stringify(entry) === JSON.stringify(expected));
        if (found < 0) return { error: 'That warning has changed. Reopen /unwarn.' };
        index = found;
    }
    const [removed] = content.splice(index, 1);
    warns.Content = content;
    await warns.save();
    const infra = await mod.findByMember(mod.infractionsDB, guildId, userId);
    if (infra && Array.isArray(infra.Warns)) {
        const matches = infra.Warns.map((entry, at) => ({ entry, at })).filter(({ entry }) => removed.warningId
            ? entry.warningId === removed.warningId
            : ['ExecuterID', 'ExecuterTag', 'Reason', 'Date'].every((key) => entry[key] === removed[key]));
        // Never remove an unrelated historical warning just because its offset matches.
        if (matches.length === 1) {
            infra.Warns.splice(matches[0].at, 1);
            await infra.save();
        }
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
    const message = await mod.replyWithMessage(interaction, {
        content: `Pick a warning to remove from <@${target.id}>.${extra}`,
        components: [new ActionRowBuilder().addComponents(menu)],
        allowedMentions: mod.allowedMentions(target.id),
    });
    if (!message || typeof message.createMessageComponentCollector !== 'function') return message;

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
            await deferComponent(component);
            const result = await removeAt(interaction.guildId, member.id, id - 1, shown[id - 1]);
            if (result.error) {
                await component.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
                return;
            }
            await updateComponent(component, {
                content: `✅ Removed warning **#${result.id}** from <@${member.id}>.`,
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
    return message;
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
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    example: '/unwarn target:@user id:1',
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers],
    async execute(interaction) {
        try {
            const target = interaction.options.getMember('target');
            const block = mod.guardMember(interaction, target, PermissionFlagsBits.KickMembers);
            if (block) return finishReply(interaction, mod.ephemeral(block));
            await mod.hold(interaction);
            const warns = await mod.findByMember(mod.warnDB, interaction.guildId, target.id);
            const entries = listOf(warns);
            if (!entries.length) {
                return mod.answer(interaction, mod.embedReply(
                    mod.Colors.Blue,
                    `<@${target.id}> has no warnings.`,
                    'warn',
                    [target.id],
                ));
            }
            const id = interaction.options.getInteger('id');
            if (id == null) return presentPicker(interaction, target, entries);
            const parsed = mod.positiveInteger(id);
            if (!parsed) return mod.answer(interaction, mod.ephemeral('That warn id is not valid.'));
            const result = await removeAt(interaction.guildId, target.id, parsed - 1);
            if (result.error) return mod.answer(interaction, mod.ephemeral(result.error));
            return mod.answer(interaction, mod.embedReply(
                mod.Colors.Green,
                mod.actionText('✅', `Removed warning **#${result.id}** from <@${target.id}>.`),
                'warn',
                [target.id],
            ));
        } catch (error) {
            return mod.replyError(interaction, error, 'Unwarn failed.');
        }
    },
};
