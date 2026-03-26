/**
 * Karşılama: misafir bot komut kanalı öncelikli (welcomeTextId yalnızca eski kayıtlar için yedek).
 */
function resolveWelcomeChannelId(cfg) {
  const guest = cfg?.channels?.guestSlashCommandsChannelId
    ? String(cfg.channels.guestSlashCommandsChannelId).trim()
    : '';
  if (guest) return guest;
  const legacy = cfg?.channels?.welcomeTextId ? String(cfg.channels.welcomeTextId).trim() : '';
  return legacy || null;
}

function resolveRegistrationLogTargetId(cfg) {
  const log = cfg?.channels?.registrationLogChannelId
    ? String(cfg.channels.registrationLogChannelId).trim()
    : '';
  if (log) return log;
  return resolveWelcomeChannelId(cfg);
}

module.exports = { resolveWelcomeChannelId, resolveRegistrationLogTargetId };
