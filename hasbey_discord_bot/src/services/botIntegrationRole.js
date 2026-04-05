const { PermissionFlagsBits } = require('discord.js');

/**
 * Discord'un bota verdiği yönetilen (entegrasyon) rolünde
 * "çevrimiçi üyelerden ayrı göster" = Role.hoist.
 * Kullanıcı listesinde sade kalması için hoist kapatılır.
 * Rol mümkünse hiyerarşide en alta alınır (@everyone hemen üstü).
 */
async function disableBotIntegrationRoleHoist(guild) {
  const me = guild.members.me;
  if (!me) return;
  const role = me.roles.botRole;
  if (!role?.managed) return;
  const reason = 'HasBEY: entegrasyon bot rolü';
  if (role.hoist) {
    await role.setHoist(false, `${reason} — hoist kapalı`).catch(() => {});
  }
  if (me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await role.setPosition(1, { relative: false, reason: `${reason} — en alta` }).catch(() => {});
  }
}

async function disableBotIntegrationRoleHoistAll(client) {
  for (const g of client.guilds.cache.values()) {
    await disableBotIntegrationRoleHoist(g);
  }
}

module.exports = {
  disableBotIntegrationRoleHoist,
  disableBotIntegrationRoleHoistAll,
};
