const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const permissions = new PermissionsBitField([P.ViewChannel, P.SendMessages, P.SendMessagesInThreads,
    P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory, P.ManageMessages, P.ManageRoles, P.KickMembers,
    P.BanMembers, P.ViewAuditLog]).bitfield.toString();
function inviteUrl() {
    return `https://discord.com/api/oauth2/authorize?client_id=${process.env.APPLICATIONID}&permissions=${permissions}&scope=bot%20applications.commands`;
}
module.exports = { inviteUrl };
