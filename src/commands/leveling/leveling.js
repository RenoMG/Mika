const { SlashCommandBuilder } = require('discord.js');
const Levels = require('../../levels');
const { applySlashDefaults } = require('../../utils/slashCommand');

Levels.setURL(`${process.env.MIKADATABASE}`).catch((error) => {
    console.error('Leveling database connection failed.', error);
});

function memberLabel(entry) {
    if (!entry || entry.departed || !entry.username || entry.username === 'Unknown user') {
        return 'Unknown user (left the server)';
    }
    if (entry.discriminator && entry.discriminator !== '0' && entry.discriminator !== '0000') {
        return `${entry.username}#${entry.discriminator}`;
    }
    return entry.username;
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('levels')
        .setDescription('Leveling based commands.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('rank')
                .setDescription("Returns a member's rank.")
                .addUserOption(option => option.setName('target').setDescription('Member to look up. Defaults to you.')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Returns the server leaderboard.'))),
    category: 'leveling',
    configKey: 'LevelingCommandStatus',
    checkDisabledChannels: true,
    example: '/levels rank',
    examples: {
        rank: '/levels rank target:@user',
        leaderboard: '/levels leaderboard',
    },
    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        if (!interaction.guild) return interaction.reply('You are at level 0');

        if (sub === 'rank') {
            const target = interaction.options.getUser('target') || interaction.user;
            if (!target || !target.id) return interaction.reply('You are at level 0');

            const user = await Levels.fetch(target.id, interaction.guild.id, true);
            const who = target.id === interaction.user.id ? 'You are' : `${target.username || 'That member'} is`;
            if (!user) return interaction.reply(`${who} at level 0`);

            const rank = user.position ? ` (rank #${user.position})` : '';
            return interaction.reply(`${who} at level ${user.level}${rank} with ${user.xp} XP.`);
        }

        if (sub === 'leaderboard') {
            const rawLeaderboard = await Levels.fetchLeaderboard(interaction.guild.id, 10);
            if (!rawLeaderboard || rawLeaderboard.length < 1) return interaction.reply('Leaderboard is not populated yet.');

            const leaderboard = await Levels.computeLeaderboard(client, rawLeaderboard);
            if (!leaderboard.length) return interaction.reply('Leaderboard is not populated yet.');

            const lines = leaderboard.map((entry) => `**${entry.position}**. ${memberLabel(entry)} - Level: ${entry.level} - XP: ${entry.xp}`);
            return interaction.reply(`Leaderboard for **${interaction.guild.name}**\n${lines.join('\n')}`);
        }

        return interaction.reply('no subcommand was used.');
    },
};
