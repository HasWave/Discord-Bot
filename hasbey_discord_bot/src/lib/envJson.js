const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/**
 * Önce .env (varsa), sonra kök env.json — JSON aynı anahtarları ezer.
 * env.json hem camelCase hem UPPER_SNAKE kabul eder.
 */
function normalizeGuildIdsValue(raw) {
  if (raw == null) return '';
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean).join(',');
  }
  return String(raw).trim();
}

function applyEnvJsonToProcess(envPath) {
  if (!fs.existsSync(envPath)) return;
  let j;
  try {
    j = JSON.parse(fs.readFileSync(envPath, 'utf8'));
  } catch {
    return;
  }
  if (!j || typeof j !== 'object') return;

  const pick = (...keys) => {
    for (const k of keys) {
      if (k in j && j[k] != null) {
        const s = typeof j[k] === 'string' ? j[k].trim() : String(j[k]).trim();
        if (s) return s;
      }
    }
    return '';
  };

  const pairs = [];
  const t = pick('DISCORD_TOKEN', 'discordToken');
  if (t) pairs.push(['DISCORD_TOKEN', t.replace(/^["']|["']$/g, '').trim()]);
  const g = pick('GUILD_ID', 'guildId');
  if (g) pairs.push(['GUILD_ID', g]);
  if (Array.isArray(j.guildIds) && j.guildIds.length) {
    const joined = normalizeGuildIdsValue(j.guildIds);
    if (joined) pairs.push(['GUILD_IDS', joined]);
  } else {
    const gs = pick('GUILD_IDS', 'guildIds');
    if (gs) pairs.push(['GUILD_IDS', normalizeGuildIdsValue(gs)]);
  }
  const c = pick('CLIENT_ID', 'clientId', 'APPLICATION_ID', 'applicationId');
  if (c) {
    pairs.push(['CLIENT_ID', c]);
    pairs.push(['APPLICATION_ID', c]);
  }
  const pk = pick('DISCORD_PUBLIC_KEY', 'discordPublicKey', 'publicKey');
  if (pk) pairs.push(['DISCORD_PUBLIC_KEY', pk]);
  const guestDef = pick('DEFAULT_GUEST_ROLE_ID', 'defaultGuestRoleId');
  if (guestDef && /^\d{10,25}$/.test(guestDef)) pairs.push(['DEFAULT_GUEST_ROLE_ID', guestDef]);

  for (const [k, v] of pairs) {
    if (v) process.env[k] = v;
  }

  for (const [k, val] of Object.entries(j)) {
    if (typeof k !== 'string' || val == null) continue;
    if (/^[A-Z][A-Z0-9_]*$/.test(k)) {
      const s = typeof val === 'string' ? val.trim() : String(val).trim();
      if (s) process.env[k] = s;
    }
  }
}

/** Bot / deploy / menü girişi — root = HasBEY proje kökü */
function loadProjectEnv(root) {
  const envDotenv = path.join(root, '.env');
  // .env proje kökünden okunur (cwd’den bağımsız). override: true → boş/yarım process.env yerel .env ile dolsun.
  dotenv.config({ path: envDotenv, override: true });
  const envJson = path.join(root, 'env.json');
  applyEnvJsonToProcess(envJson);
  try {
    if (fs.existsSync(envJson)) {
      const obj = readEnvJsonObject(root);
      if (sanitizeEnvGuildIdFields(obj)) writeEnvJsonObject(root, obj);
    }
  } catch {
    /* */
  }
}

function envJsonPath(root) {
  return path.join(root, 'env.json');
}

function readEnvJsonObject(root) {
  const p = envJsonPath(root);
  if (!fs.existsSync(p)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

/** GUILD_ID doluysa anlamsız boş GUILD_IDS / guildIds dizilerini kaldır (tek sunucu senaryosu) */
function sanitizeEnvGuildIdFields(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const gid = String(obj.GUILD_ID || obj.guildId || '').trim();
  if (!gid || !/^\d{10,30}$/.test(gid)) return false;
  let changed = false;
  if (Array.isArray(obj.GUILD_IDS) && obj.GUILD_IDS.length === 0) {
    delete obj.GUILD_IDS;
    changed = true;
  }
  if (Array.isArray(obj.guildIds) && obj.guildIds.length === 0) {
    delete obj.guildIds;
    changed = true;
  }
  return changed;
}

function writeEnvJsonObject(root, obj) {
  sanitizeEnvGuildIdFields(obj);
  fs.writeFileSync(envJsonPath(root), JSON.stringify(obj, null, 2), 'utf8');
}

/** Menü: tek üst düzey anahtar güncelle (UPPER_SNAKE) + process.env */
function setEnvJsonKeyUpper(root, key, value) {
  const obj = readEnvJsonObject(root);
  obj[key] = String(value).trim();
  writeEnvJsonObject(root, obj);
  process.env[key] = obj[key];
}

function stripEnvJsonKeysUpper(root, keys) {
  const obj = readEnvJsonObject(root);
  let changed = false;
  for (const k of keys) {
    if (k in obj) {
      delete obj[k];
      changed = true;
    }
  }
  if (changed) writeEnvJsonObject(root, obj);
  for (const k of keys) delete process.env[k];
}

function getFromEnvJson(root, canonicalUpper) {
  const j = readEnvJsonObject(root);
  const map = {
    DISCORD_TOKEN: ['DISCORD_TOKEN', 'discordToken'],
    GUILD_ID: ['GUILD_ID', 'guildId'],
    CLIENT_ID: ['CLIENT_ID', 'clientId', 'APPLICATION_ID', 'applicationId'],
    APPLICATION_ID: ['APPLICATION_ID', 'applicationId', 'CLIENT_ID', 'clientId'],
    GUILD_IDS: ['GUILD_IDS', 'guildIds'],
    DISCORD_PUBLIC_KEY: ['DISCORD_PUBLIC_KEY', 'discordPublicKey', 'publicKey'],
    DEFAULT_GUEST_ROLE_ID: ['DEFAULT_GUEST_ROLE_ID', 'defaultGuestRoleId'],
  };
  const keys = map[canonicalUpper] || [canonicalUpper];
  for (const k of keys) {
    if (j[k] == null) continue;
    if (canonicalUpper === 'GUILD_IDS' && Array.isArray(j[k])) {
      const s = normalizeGuildIdsValue(j[k]);
      if (s) return s;
      continue;
    }
    const s = typeof j[k] === 'string' ? j[k].trim() : String(j[k]).trim();
    if (s) return s;
  }
  return '';
}

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
