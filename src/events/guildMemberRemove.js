const { Colors } = require('discord.js');
const { getGuildConfig } = require('../utils/getGuildConfig');
const { logChannel, sendLog, field } = require('../utils/logging');
const { roleAssignmentError } = require('../utils/roles');
const { DEFAULT_FAREWELL_MESSAGE, formatMessage, memberValues, storedMessage } = require('../utils/formatMessage');
const { allowedMentions } = require('../utils/mentions');
module.exports = { name: 'guildMemberRemove', async execute(member) {
    if (!member?.guild || !member.user) return;
    const data = await getGuildConfig(member.guild.id);
    const jobs = [
        (async () => {
            if (field(data, 'FarewellStatus', 'Status') === 'true') {
                const channel = member.guild.channels.cache.get(field(data, 'FarewellChannel', 'Channel'));
                if (channel?.send) await channel.send({ content: formatMessage(storedMessage(data.FarewellMessage, DEFAULT_FAREWELL_MESSAGE), memberValues(member)), allowedMentions: allowedMentions(member.id) });
            }
        })(),
        (async () => {
            await sendLog(await logChannel(member.guild, data), 'USER LEAVE', `${member.user.tag || member.user.username} (${member.id})`, Colors.Red);
        })(),
    ];
    const results = await Promise.allSettled(jobs);
    const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Member event actions failed');
} };
