const fs = require('fs');
const path = require('path');
const { mainConfigPath, readMainConfig, readBotEnvFromMainConfig } = require('./mainConfig');

function configPath(root) {
  return mainConfigPath(root);
}

function writeMainConfig(root, obj) {
  const p = configPath(root);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function ensureObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** Bot / deploy / menü girişi — sadece merkezi config.json kullanılır */
function loadProjectEnv(root) {
  const cfgEnv = readBotEnvFromMainConfig(root);
  if (cfgEnv.DISCORD_TOKEN) process.env.DISCORD_TOKEN = cfgEnv.DISCORD_TOKEN;
  if (cfgEnv.GUILD_ID) process.env.GUILD_ID = cfgEnv.GUILD_ID;
  if (cfgEnv.CLIENT_ID) {
    process.env.CLIENT_ID = cfgEnv.CLIENT_ID;
    process.env.APPLICATION_ID = cfgEnv.CLIENT_ID;
  }
  if (cfgEnv.DISCORD_PUBLIC_KEY) process.env.DISCORD_PUBLIC_KEY = cfgEnv.DISCORD_PUBLIC_KEY;

  const cfg = readMainConfig(root);
  const roles = ensureObject(cfg['Rol Ayarları']);
  const guestRoleId = String(roles['Misafir Rol ID'] || '').trim();
  if (/^\d{10,25}$/.test(guestRoleId)) process.env.DEFAULT_GUEST_ROLE_ID = guestRoleId;
}

/** Legacy API adı korunuyor: artık config.json yolunu döndürür */
function envJsonPath(root) {
  return configPath(root);
}

/** Legacy API adı korunuyor: artık config.json nesnesini döndürür */
function readEnvJsonObject(root) {
  return readMainConfig(root);
}

/** Legacy API adı korunuyor: artık config.json yazar */
function writeEnvJsonObject(root, obj) {
  writeMainConfig(root, ensureObject(obj));
}

function setEnvJsonKeyUpper(root, key, value) {
  const cfg = ensureObject(readMainConfig(root));
  cfg['Discord & Bot'] = ensureObject(cfg['Discord & Bot']);
  cfg['Rol Ayarları'] = ensureObject(cfg['Rol Ayarları']);
  const v = String(value ?? '').trim();

  if (key === 'DISCORD_TOKEN') cfg['Discord & Bot']['Discord Token'] = v;
  else if (key === 'GUILD_ID') cfg['Discord & Bot']['Sunucu ID'] = v;
  else if (key === 'CLIENT_ID' || key === 'APPLICATION_ID') cfg['Discord & Bot']['Uygulama ID'] = v;
  else if (key === 'DISCORD_PUBLIC_KEY') cfg['Discord & Bot']['Açık Anahtar'] = v;
  else if (key === 'DEFAULT_GUEST_ROLE_ID') cfg['Rol Ayarları']['Misafir Rol ID'] = v;
  else return;

  writeMainConfig(root, cfg);
  if (key === 'APPLICATION_ID' || key === 'CLIENT_ID') {
    process.env.CLIENT_ID = v;
    process.env.APPLICATION_ID = v;
  } else {
    process.env[key] = v;
  }
}

function stripEnvJsonKeysUpper(root, keys) {
  const cfg = ensureObject(readMainConfig(root));
  cfg['Discord & Bot'] = ensureObject(cfg['Discord & Bot']);
  cfg['Rol Ayarları'] = ensureObject(cfg['Rol Ayarları']);
  let changed = false;
  for (const key of keys) {
    if (key === 'DISCORD_TOKEN' && 'Discord Token' in cfg['Discord & Bot']) {
      delete cfg['Discord & Bot']['Discord Token'];
      changed = true;
    }
    if (key === 'GUILD_ID' && 'Sunucu ID' in cfg['Discord & Bot']) {
      delete cfg['Discord & Bot']['Sunucu ID'];
      changed = true;
    }
    if ((key === 'CLIENT_ID' || key === 'APPLICATION_ID') && 'Uygulama ID' in cfg['Discord & Bot']) {
      delete cfg['Discord & Bot']['Uygulama ID'];
      changed = true;
    }
    if (key === 'DISCORD_PUBLIC_KEY' && 'Açık Anahtar' in cfg['Discord & Bot']) {
      delete cfg['Discord & Bot']['Açık Anahtar'];
      changed = true;
    }
    if (key === 'DEFAULT_GUEST_ROLE_ID' && 'Misafir Rol ID' in cfg['Rol Ayarları']) {
      delete cfg['Rol Ayarları']['Misafir Rol ID'];
      changed = true;
    }
    delete process.env[key];
  }
  if (changed) writeMainConfig(root, cfg);
}

function getFromEnvJson(root, canonicalUpper) {
  const cfg = ensureObject(readMainConfig(root));
  const bot = ensureObject(cfg['Discord & Bot']);
  const roles = ensureObject(cfg['Rol Ayarları']);

  if (canonicalUpper === 'DISCORD_TOKEN') return String(bot['Discord Token'] || '').trim();
  if (canonicalUpper === 'GUILD_ID') return String(bot['Sunucu ID'] || '').trim();
  if (canonicalUpper === 'CLIENT_ID' || canonicalUpper === 'APPLICATION_ID') {
    return String(bot['Uygulama ID'] || '').trim();
  }
  if (canonicalUpper === 'DISCORD_PUBLIC_KEY') return String(bot['Açık Anahtar'] || '').trim();
  if (canonicalUpper === 'DEFAULT_GUEST_ROLE_ID') return String(roles['Misafir Rol ID'] || '').trim();
  return '';
}

function applyEnvJsonToProcess() {}

module.exports = {
  loadProjectEnv,
  envJsonPath,
  readEnvJsonObject,
  writeEnvJsonObject,
  setEnvJsonKeyUpper,
  stripEnvJsonKeysUpper,
  applyEnvJsonToProcess,
  getFromEnvJson,
};
