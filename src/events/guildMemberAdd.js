const { Colors } = require('discord.js');
const { getGuildConfig } = require('../utils/getGuildConfig');
const { logChannel, sendLog, field } = require('../utils/logging');
const { roleAssignmentError } = require('../utils/roles');
const { DEFAULT_GREETING_MESSAGE, formatMessage, memberValues, storedMessage } = require('../utils/formatMessage');
const { allowedMentions } = require('../utils/mentions');
module.exports = { name: 'guildMemberAdd', async execute(member) {
    if (!member?.guild || !member.user) return;
    const data = await getGuildConfig(member.guild.id);
    const jobs = [
        (async () => {
            if (field(data, 'GreetingStatus', 'Status') === 'true') {
                const channel = member.guild.channels.cache.get(field(data, 'GreetingChannel', 'Channel'));
                if (channel?.send) await channel.send({ content: formatMessage(storedMessage(data.GreetingMessage, DEFAULT_GREETING_MESSAGE), memberValues(member)), allowedMentions: allowedMentions(member.id) });
            }
        })(),
        (async () => {
            if (field(data, 'AutoroleStatus', 'Status') === 'true') {
                const role = member.guild.roles.cache.get(field(data, 'AutoroleRole', 'Role'));
                const error = roleAssignmentError(member.guild, role);
                if (!error) await member.roles.add(role.id);
                else console.warn('Auto-role skipped:', error);
            }
        })(),
        (async () => {
            await sendLog(await logChannel(member.guild, data), 'USER JOIN', `${member.user.tag || member.user.username} (${member.id})`, Colors.Green);
        })(),
    ];
    const results = await Promise.allSettled(jobs);
    const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Member event actions failed');
} };
