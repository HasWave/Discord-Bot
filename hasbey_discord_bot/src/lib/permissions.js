const { PermissionFlagsBits } = require('discord.js');

function meHas(guild, bits) {
  const me = guild.members.me;
  if (!me) return false;
  return me.permissions.has(bits);
}

module.exports = {
  meHas,
  NEED_MANAGE: PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles,
  NEED_VOICE: PermissionFlagsBits.MoveMembers | PermissionFlagsBits.ManageChannels,
};
