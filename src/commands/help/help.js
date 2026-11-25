const { redact } = require('../../utils/redact');
const { finish: finishReply } = require('../../utils/ack');
const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const helpMenu = require('./menu/helpMenu');
const { getGuildConfig } = require('../../utils/getGuildConfig');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mika help menu.')),
    category: 'help',
    replies: 'private',
    checkDisabledChannels: true,
    example: '/help',
    async execute(interaction, client) {
        const config = interaction.guild
            ? await getGuildConfig(interaction.guild.id, { readOnly: true }).catch(() => null)
            : null;
        const categories = helpMenu.groupCommands(client.commands, config);
        let selected = null;
        const replyView = () => helpMenu.buildHelpView(categories, selected);

        const response = await finishReply(interaction, {
            ...replyView(),
            flags: MessageFlags.Ephemeral,
            withResponse: true,
        });
        const message = response.resource?.message ?? await interaction.fetchReply();

        const collector = message.createMessageComponentCollector({ time: helpMenu.HELP_TIMEOUT_MS });

        collector.on('collect', async (component) => {
            try {
                if (component.user.id !== interaction.user.id) {
                    await component.reply({
                        content: 'Only the person who used /help can use this menu.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const choice = helpMenu.selectionFrom(component);
                if (!choice) return;
                selected = choice.id;
                const view = replyView();
                await component.update({ embeds: view.embeds, components: view.components });
            } catch (error) { console.error(redact(error)); }
        });
        collector.on('end', async () => {
            const view = helpMenu.buildHelpView(categories, selected, { disabled: true });
            try {
                await interaction.editReply({ embeds: view.embeds, components: view.components });
            } catch (error) {
                // The ephemeral message can already be gone when the collector ends.
            }
        });
    },
};
