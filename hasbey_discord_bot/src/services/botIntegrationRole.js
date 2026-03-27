/**
 * Discord'un bota verdiği yönetilen (entegrasyon) rolünde
 * "çevrimiçi üyelerden ayrı göster" = Role.hoist.
 * Kullanıcı listesinde sade kalması için hoist kapatılır.
 */
async function disableBotIntegrationRoleHoist(guild) {
  const me = guild.members.me;
  if (!me) return;
  const role = me.roles.botRole;
  if (!role?.managed || !role.hoist) return;
  const reason = 'HasBEY: entegrasyon rolü — çevrimiçi ayrımı kapalı';
  await role.setHoist(false, reason).catch(() => {});
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
