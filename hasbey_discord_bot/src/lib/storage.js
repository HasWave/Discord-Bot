const fs = require('fs');
const path = require('path');
const { dataDir, guildFile, backupDir, channelIdsJsonPath, backupImportTemplatePath } = require('./paths');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readChannelIdsOverlay(guildId) {
  if (!fs.existsSync(channelIdsJsonPath)) return {};
  try {
    const all = JSON.parse(fs.readFileSync(channelIdsJsonPath, 'utf8'));
    const slice = all[String(guildId)];
    return slice && typeof slice === 'object' && !Array.isArray(slice) ? { ...slice } : {};
  } catch {
    return {};
  }
}

function mergeChannelsWithOverlay(guildId, channelsObj) {
  const ov = readChannelIdsOverlay(guildId);
  const base = channelsObj && typeof channelsObj === 'object' ? { ...channelsObj } : {};
  return { ...base, ...ov };
}

function syncChannelIdsJsonFile(guildId, channels) {
  let all = {};
  if (fs.existsSync(channelIdsJsonPath)) {
    try {
      all = JSON.parse(fs.readFileSync(channelIdsJsonPath, 'utf8'));
      if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    } catch {
      all = {};
    }
  }
  const ch = channels && typeof channels === 'object' && !Array.isArray(channels) ? { ...channels } : {};
  const id = String(guildId);
  if (Object.keys(ch).length === 0) delete all[id];
  else all[id] = ch;
  ensureDir(path.dirname(channelIdsJsonPath));
  fs.writeFileSync(channelIdsJsonPath, JSON.stringify(all, null, 2), 'utf8');
}

function defaultFeatures() {
  return {
    welcomeOnJoin: true,
    registrationLog: true,
    /** Kayıtta sunucu takma adını Takma ad | yaş yap (kapalıysa isim değişmez) */
    registrationNickAgeFormat: true,
    memberCountChannel: true,
    lastRegisteredDisplay: true,
    tempVoiceFromLobby: true,
    /** Ses kanalında Go Live açılınca streamAnnounceChannelId kanalına mesaj */
    streamGoLiveAnnounce: true,
    /** Twitch vb. “yayında” durumu (Discord Portalda Presence Intent açık olmalı) */
    streamRichAnnounce: false,
    afkMover: true,
    /** Metin kanalında tam eşleşen tetik (örn. sa) → yanıt */
    triggerReplies: true,
  };
}

/** Menü yumuşak sıfırlama: tüm eklentiler kapalı */
function defaultFeaturesAllOff() {
  return Object.fromEntries(Object.keys(defaultFeatures()).map((k) => [k, false]));
}

function defaultLfgShortcuts() {
  return [
    { trigger: '!v', game: 'Valorant' },
    { trigger: '!p', game: 'PUBG' },
  ];
}

/** Oyuncu arama metin kanalında !teams ve kısayol → oyun adı (embed için) */
function normalizeLfgShortcuts(raw) {
  const fallback = defaultLfgShortcuts();
  if (raw === undefined || raw === null) return fallback.map((x) => ({ ...x }));
  if (!Array.isArray(raw)) return fallback.map((x) => ({ ...x }));
  if (raw.length === 0) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    let trigger = String(r.trigger ?? '')
      .trim()
      .toLowerCase()
      .slice(0, 32);
    if (!trigger.startsWith('!')) continue;
    const game = String(r.game ?? '')
      .trim()
      .slice(0, 80);
    if (!trigger || !game) continue;
    if (seen.has(trigger)) continue;
    seen.add(trigger);
    out.push({ trigger, game });
  }
  return out.length ? out : fallback.map((x) => ({ ...x }));
}

function defaultCustomMessages() {
  return {
    /** Hoş geldin embed açıklaması satırları; boşsa varsayılan metin kullanılır. Yer tutucular: {member} {username} {tag} */
    welcomeLines: [],
    /**
     * Tetikleyici yanıtlar: mesaj (trim) tetik ile birebir eşleşirse (büyük/küçük harf yok) yanıt.
     * Yanıtta: {mention} {username} {tag}
     */
    triggerReplies: [],
    /** Ekip arama kanalında kullanılan !kısayol → Oyun adı */
    lfgShortcuts: defaultLfgShortcuts(),
  };
}

function defaultGuildRecord() {
  return {
    setupComplete: false,
    botOwnerId: null,
    roles: {
      memberRoleName: 'Kayıtlı',
      memberRoleId: null,
      guestRoleName: 'Misafir',
      guestRoleId: null,
    },
    channels: {},
    features: defaultFeatures(),
    customMessages: defaultCustomMessages(),
    timeouts: { afkMinutes: 30 },
    createdAt: null,
    updatedAt: null,
  };
}

function readGuildConfig(guildId) {
  ensureDir(dataDir);
  ensureDir(path.join(dataDir, 'guilds'));
  const fp = guildFile(guildId);
  if (!fs.existsSync(fp)) {
    const rec = { ...defaultGuildRecord() };
    rec.channels = mergeChannelsWithOverlay(guildId, rec.channels);
    return rec;
  }
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    const base = defaultGuildRecord();
    const wl = parsed.customMessages?.welcomeLines;
    const tr = parsed.customMessages?.triggerReplies;
    const normTriggers = (arr) =>
      Array.isArray(arr)
        ? arr
            .filter((r) => r && typeof r === 'object')
            .map((r) => ({
              trigger: String(r.trigger ?? '')
                .trim()
                .slice(0, 80),
              response: String(r.response ?? '')
                .trim()
                .slice(0, 500),
            }))
            .filter((r) => r.trigger.length > 0 && r.response.length > 0)
        : base.customMessages.triggerReplies;
    return {
      ...base,
      ...parsed,
      roles: {
        ...base.roles,
        ...(parsed.roles || {}),
        memberRoleName: parsed.roles?.memberRoleName ?? base.roles.memberRoleName,
        guestRoleName: parsed.roles?.guestRoleName ?? base.roles.guestRoleName,
      },
      channels: mergeChannelsWithOverlay(guildId, { ...base.channels, ...(parsed.channels || {}) }),
      features: { ...base.features, ...(parsed.features || {}) },
      customMessages: {
        ...base.customMessages,
        ...(parsed.customMessages || {}),
        welcomeLines: Array.isArray(wl) ? wl.map((s) => String(s)) : base.customMessages.welcomeLines,
        triggerReplies: normTriggers(tr),
        lfgShortcuts: normalizeLfgShortcuts(parsed.customMessages?.lfgShortcuts),
      },
      timeouts: { ...base.timeouts, ...(parsed.timeouts || {}) },
    };
  } catch {
    const rec = { ...defaultGuildRecord() };
    rec.channels = mergeChannelsWithOverlay(guildId, rec.channels);
    return rec;
  }
}

function writeGuildConfig(guildId, cfg) {
  ensureDir(dataDir);
  ensureDir(path.join(dataDir, 'guilds'));
  const next = {
    ...cfg,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(guildFile(guildId), JSON.stringify(next, null, 2), 'utf8');
  syncChannelIdsJsonFile(guildId, next.channels || {});
}

function writeBackup(guildId, name, payload) {
  const dir = backupDir(guildId);
  ensureDir(dir);
  const safe = name.replace(/[^a-z0-9-_]/gi, '_');
  const fp = path.join(dir, `${safe}.json`);
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  return fp;
}

/** `/yedekle` ile yazılan sabit dosya: sunucu-yedek.json */
const GUILD_TEMPLATE_BACKUP_BASENAME = 'sunucu-yedek';

function guildTemplateBackupPath(guildId) {
  return path.join(backupDir(guildId), `${GUILD_TEMPLATE_BACKUP_BASENAME}.json`);
}

function listGuildTemplateBackupPaths(guildId) {
  return [guildTemplateBackupPath(guildId), backupImportTemplatePath];
}

/** İlk geçerli şablon JSON’u (sunucu klasörü, sonra `data/backups/import/`) */
function loadGuildTemplateBackup(guildId) {
  try {
    const importDir = path.dirname(backupImportTemplatePath);
    if (!fs.existsSync(importDir)) fs.mkdirSync(importDir, { recursive: true });
  } catch {
    /* */
  }
  for (const p of listGuildTemplateBackupPaths(guildId)) {
    if (!fs.existsSync(p)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j && typeof j === 'object' && Array.isArray(j.channels) && Array.isArray(j.roles)) return j;
    } catch {
      /* */
    }
  }
  return null;
}

/** Geçerli yapı yedeği var mı (/kur ön şartı) */
function hasGuildTemplateBackup(guildId) {
  return loadGuildTemplateBackup(guildId) != null;
}

module.exports = {
  readGuildConfig,
  writeGuildConfig,
  writeBackup,
  guildTemplateBackupPath,
  hasGuildTemplateBackup,
  loadGuildTemplateBackup,
  listGuildTemplateBackupPaths,
  defaultGuildRecord,
  defaultFeatures,
  defaultFeaturesAllOff,
  defaultCustomMessages,
  defaultLfgShortcuts,
  normalizeLfgShortcuts,
};
