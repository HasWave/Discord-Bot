const fs = require('fs');
const path = require('path');

function mainConfigPath(root) {
  return path.join(root, 'config.json');
}

function readMainConfig(root) {
  const p = mainConfigPath(root);
  if (!fs.existsSync(p)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch {
    return {};
  }
}

function pickString(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  for (const key of keys) {
    if (!(key in obj) || obj[key] == null) continue;
    const s = String(obj[key]).trim();
    if (s) return s;
  }
  return '';
}

function readDiscordBotSection(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return {};
  const section = cfg['Discord & Bot'];
  return section && typeof section === 'object' && !Array.isArray(section) ? section : {};
}

function readChannelSection(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return {};
  const section = cfg['Kanal Ayarları'];
  return section && typeof section === 'object' && !Array.isArray(section) ? section : {};
}

function readRoleSection(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return {};
  const section = cfg['Rol Ayarları'];
  return section && typeof section === 'object' && !Array.isArray(section) ? section : {};
}

function readBotEnvFromMainConfig(root) {
  const cfg = readMainConfig(root);
  const bot = readDiscordBotSection(cfg);
  return {
    DISCORD_TOKEN: pickString(bot, ['Discord Token', 'discordToken', 'DISCORD_TOKEN']),
    GUILD_ID: pickString(bot, ['Sunucu ID', 'guildId', 'GUILD_ID']),
    CLIENT_ID: pickString(bot, ['Uygulama ID', 'applicationId', 'CLIENT_ID', 'APPLICATION_ID']),
    DISCORD_PUBLIC_KEY: pickString(bot, ['Açık Anahtar', 'publicKey', 'DISCORD_PUBLIC_KEY']),
  };
}

function readGuildOverlayFromMainConfig(root, guildId) {
  const cfg = readMainConfig(root);
  const bot = readDiscordBotSection(cfg);
  const configuredGuildId = pickString(bot, ['Sunucu ID', 'guildId', 'GUILD_ID']);
  if (configuredGuildId && String(guildId).trim() !== configuredGuildId) {
    return { channels: {}, roles: {} };
  }

  const channelsRaw = readChannelSection(cfg);
  const rolesRaw = readRoleSection(cfg);

  const channels = {};
  for (const [k, v] of Object.entries(channelsRaw)) {
    const s = String(v ?? '').trim();
    if (s) channels[k] = s;
  }

  const roles = {};
  const guestRoleId = pickString(rolesRaw, ['Misafir Rol ID', 'guestRoleId']);
  const memberRoleId = pickString(rolesRaw, ['Kayıtlı Rol ID', 'memberRoleId']);
  if (guestRoleId) roles.guestRoleId = guestRoleId;
  if (memberRoleId) roles.memberRoleId = memberRoleId;

  return { channels, roles };
}

module.exports = {
  mainConfigPath,
  readMainConfig,
  readBotEnvFromMainConfig,
  readGuildOverlayFromMainConfig,
};
