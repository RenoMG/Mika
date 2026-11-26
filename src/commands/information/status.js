const { SlashCommandBuilder } = require('discord.js');
const { embed, timestamp } = require('../../utils/style');
const { defer, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { redact } = require('../../utils/redact');
const { GENERIC_ERROR } = require('../../utils/messages');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { latencyMs } = require('../../utils/latency');
const { withTimeout } = require('../../anime/cache');
const { formatNumber } = require('./lib/present');

const COUNT_MS = 1500;

// Estimated counts read collection metadata, so they stay cheap on big caches.
// Null means the cache database is not connected or did not answer in time.
async function countCollection(getModel) {
    try {
        const model = getModel();
        if (!model) return null;
        return await withTimeout(model.estimatedDocumentCount(), COUNT_MS);
    } catch {
        return null;
    }
}

async function cacheCounts() {
    const [anime, guess] = await Promise.all([
        countCollection(() => require('../../Models/AnimeCache').get()),
        countCollection(() => require('../../Models/GuessAnime').get()),
    ]);
    return { anime, guess };
}

function countValue(count) {
    return count === null || count === undefined ? 'Unavailable' : formatNumber(count);
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('status')
        .setDescription('Shows Mika\'s uptime, latency, memory, and cache stats.')),
    category: 'information',
    replies: 'public',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/status',
    async execute(interaction, _client, deps = {}) {
        const sentAt = Date.now();
        await defer(interaction);
        const roundTrip = Date.now() - sentAt;
        try {
            const counts = await (deps.cacheCounts || cacheCounts)();
            const { client } = interaction;
            const started = Date.now() - client.uptime;
            const userEmbed = embed({ title: 'Mika status', label: 'status' })
                .addFields(
                    { name: 'Online since', value: `${timestamp(started, 'f')} (${timestamp(started, 'R')})`, inline: true },
                    { name: 'Latency', value: `${latencyMs(client, roundTrip)} ms`, inline: true },
                    { name: 'Memory', value: `${formatNumber(process.memoryUsage().heapUsed / 1024 / 1024)} MB`, inline: true },
                    { name: 'Anime cached', value: countValue(counts.anime), inline: true },
                    { name: 'Guess pool', value: countValue(counts.guess), inline: true },
                );
            return finish(interaction, { embeds: [userEmbed], allowedMentions: allowedMentions() });
        } catch (error) {
            console.error('Status failed.', redact(error));
            if (interaction.replied) return null;
            return finish(interaction, {
                content: GENERIC_ERROR,
                allowedMentions: allowedMentions(),
            });
        }
    },
};
