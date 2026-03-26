/**
 * Config'te rol ID boşsa `memberRoleName` ile sunucudan çözümle (Kayıtlı vb.).
 * @returns {string|null} snowflake veya bulunamazsa null
 */
function resolveMemberRoleId(guild, cfg) {
  const raw = cfg?.roles?.memberRoleId;
  if (raw != null && raw !== '') {
    const id = String(raw).trim();
    if (/^\d{10,25}$/.test(id)) return id;
  }
  const name = cfg?.roles?.memberRoleName != null ? String(cfg.roles.memberRoleName).trim() : '';
  if (!name) return null;
  const role = guild.roles.cache.find((r) => r.name === name);
  return role?.id ?? null;
}

function resolveGuestRoleId(guild, cfg) {
  const raw = cfg?.roles?.guestRoleId;
  if (raw != null && raw !== '') {
    const id = String(raw).trim();
    if (/^\d{10,25}$/.test(id)) return id;
  }
  const name = cfg?.roles?.guestRoleName != null ? String(cfg.roles.guestRoleName).trim() : '';
  if (!name) return null;
  const role = guild.roles.cache.find((r) => r.name === name);
  return role?.id ?? null;
}

module.exports = { resolveMemberRoleId, resolveGuestRoleId };
