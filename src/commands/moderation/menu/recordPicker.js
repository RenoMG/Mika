const {
    ActionRowBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
} = require('discord.js');
const { deferComponent, updateComponent } = require('../../../utils/ack');
const { redact } = require('../../../utils/redact');
const mod = require('../../../utils/moderation');

const PICK_ID = 'removeinfraction:pick';
const TIMEOUT_MS = 120000;
const ONLY = 'Only the person who used /removeinfraction can use this menu.';
const LIMIT = 25;

function optionLabel(entry, index) {
    const reason = String(entry && entry.Reason ? entry.Reason : 'No reason').replace(/\s+/g, ' ').trim();
    return `${index + 1}. ${reason || 'No reason'}`.slice(0, 100);
}

function pickerMenu(type, entries) {
    return new StringSelectMenuBuilder()
        .setCustomId(PICK_ID)
        .setPlaceholder(`Choose a ${type.one}`)
        .addOptions(entries.map((entry, index) => ({
            label: optionLabel(entry, index),
            value: String(index + 1),
            description: `Id ${index + 1}`,
        })));
}

// Removes the record a moderator picked, by its id, re-checking who may edit
// it. Returns the confirmation or the reason it could not be removed.
async function removePicked(interaction, { user, member, type, expected }) {
    const block = mod.recordGuard(interaction, user, member);
    if (block) return { error: block };
    const doc = await mod.findByMember(mod.infractionsDB, interaction.guildId, user.id);
    if (!doc) return { error: 'That record has changed. Open the list again.' };
    const result = await mod.removeRecord(doc, type.key, { expected });
    if (result.error) return result;
    const outcome = await mod.logAction(interaction, removalLog(type, user, result));
    return { ...result, outcome };
}

function removalLog(type, user, { removed, id, doc }) {
    const by = removed && mod.snowflake(removed.ExecuterID);
    return {
        color: 'primary',
        title: '🗑️ Infraction removed',
        user,
        fields: [
            { name: 'Removed', value: `${type.one[0].toUpperCase()}${type.one.slice(1)} #${id}${by ? ` by <@${by}>` : ''}` },
            { name: 'Record', value: mod.recordSummary(doc) },
            { name: 'Original reason', value: String((removed && removed.Reason) || 'No reason').slice(0, 1024), inline: false },
        ],
    };
}

async function presentPicker(interaction, { user, member, type, entries }) {
    const shown = entries.slice(0, LIMIT);
    const menu = pickerMenu(type, shown);
    const extra = entries.length > shown.length
        ? `\n\nThe menu lists the first ${shown.length}. Pass an id for a later one.`
        : '';
    const message = await mod.replyWithMessage(interaction, {
        content: `Pick a ${type.one} to remove from <@${user.id}>.${extra}`,
        components: [new ActionRowBuilder().addComponents(menu)],
        allowedMentions: mod.allowedMentions(user.id),
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
            if (!id || id > shown.length) return;
            await deferComponent(component);
            const result = await removePicked(interaction, { user, member, type, expected: shown[id - 1] });
            if (result.error) {
                await component.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
                return;
            }
            const note = result.outcome && result.outcome.note ? `\n${result.outcome.note}` : '';
            await updateComponent(component, {
                content: `✅ Removed ${type.one} **#${result.id}** from <@${user.id}>.${note}`,
                components: [],
                allowedMentions: mod.allowedMentions(user.id),
            });
            collector.stop('done');
        } catch (error) {
            console.error('Remove infraction selection failed.', redact(error));
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
    ONLY,
    removePicked,
    removalLog,
    presentPicker,
};
