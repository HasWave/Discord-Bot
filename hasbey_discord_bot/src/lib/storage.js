const fs = require('fs');
const path = require('path');
const { dataDir, guildFile, backupDir, backupImportTemplatePath } = require('./paths');
const { readGuildOverlayFromMainConfig } = require('./mainConfig');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** `data/guilds` kanalları + kök `config.json` (Kanal Ayarları) üzerine yazar. */
function mergeChannelsWithOverlay(guildId, channelsObj) {
  const base = channelsObj && typeof channelsObj === 'object' ? { ...channelsObj } : {};
  const fromMainConfig = readGuildOverlayFromMainConfig(path.join(__dirname, '..', '..'), guildId);
  return { ...base, ...(fromMainConfig.channels || {}) };
}

function defaultFeatures() {
  return {
    welcomeOnJoin: true,
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
    /** Yasaklı kelime filtresi (mesajı sil + uyar) */
    wordFilter: true,
    /** Misafir bot komut kanalında yazınca kayıt hatırlatması (mesaj süresi: timeouts) */
    guestSlashRegisterReminder: true,
    /** /at, /kilitle, /limit, /devret, /ban, /kick, /unban — menüden kapatılabilir */
    staffModerationCommands: true,
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
    /** Yasaklı kelime listesi (küçük harf normalize) */
    badWords: [],
    /** Hoş geldin görsel/başlık özelleştirme */
    welcomeCard: {
      title: '👋 Hoş geldin',
      imageUrl: '',
      color: '#FEE75C',
    },
  };
}

function normalizeBadWords(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const x of raw) {
    const w = String(x ?? '')
      .toLowerCase()
      .trim()
      .slice(0, 64);
    if (!w || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

function normalizeWelcomeCard(raw, fallback) {
  const f = fallback || defaultCustomMessages().welcomeCard;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...f };
  const title = String(raw.title ?? f.title)
    .trim()
    .slice(0, 120);
  const imageUrl = String(raw.imageUrl ?? '')
    .trim()
    .slice(0, 500);
  const color = String(raw.color ?? f.color)
    .trim()
    .slice(0, 16);
  return {
    title: title || f.title,
    imageUrl,
    color: color || f.color,
  };
}

/** Guild JSON’da guestRoleId yoksa config.json içindeki Misafir Rol ID fallback’i kullanılır. */
function guestRoleIdFromEnv() {
  const v = process.env.DEFAULT_GUEST_ROLE_ID;
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^\d{10,25}$/.test(s)) return null;
  return s;
}

function applyGuestRoleIdEnvFallback(roles) {
  const out = { ...roles };
  const cur = out.guestRoleId;
  if (cur != null && String(cur).trim() !== '') return out;
  const fromEnv = guestRoleIdFromEnv();
  if (fromEnv) out.guestRoleId = fromEnv;
  return out;
}

function applyMainConfigRoleOverlay(guildId, roles) {
  const out = { ...(roles || {}) };
  const fromMainConfig = readGuildOverlayFromMainConfig(path.join(__dirname, '..', '..'), guildId);
  const overlay = fromMainConfig.roles || {};
  if (overlay.memberRoleId) out.memberRoleId = overlay.memberRoleId;
  if (overlay.guestRoleId) out.guestRoleId = overlay.guestRoleId;
  return out;
}

function defaultGuildRecord() {
  return {
    setupComplete: false,
    botOwnerId: null,
    roles: {
      memberRoleName: '🎖️ ᴛᴇꜱ̧ᴋɪʟᴀᴛ',
      memberRoleId: null,
      /** defaultTemplate misafir rol adı ile aynı olmalı (ID yoksa isimle çözüm için) */
      guestRoleName: '👤 ᴍɪꜱᴀꜰɪʀ',
      guestRoleId: guestRoleIdFromEnv(),
    },
    channels: {},
    features: defaultFeatures(),
    customMessages: defaultCustomMessages(),
    timeouts: {
      afkMinutes: 30,
      guestRegisterReminderDeleteMinutes: 5,
      /** `dm_once` = özelden 1 kez (kalıcı); `channel` = kanalda yanıt + süre sonunda sil */
      guestRegisterReminderStyle: 'dm_once',
    },
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
    rec.roles = applyMainConfigRoleOverlay(guildId, rec.roles);
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
    const out = {
      ...base,
      ...parsed,
      roles: applyGuestRoleIdEnvFallback({
        ...base.roles,
        ...(parsed.roles || {}),
        memberRoleName: parsed.roles?.memberRoleName ?? base.roles.memberRoleName,
        guestRoleName: parsed.roles?.guestRoleName ?? base.roles.guestRoleName,
      }),
      channels: mergeChannelsWithOverlay(guildId, { ...base.channels, ...(parsed.channels || {}) }),
      features: { ...base.features, ...(parsed.features || {}) },
      customMessages: {
        ...base.customMessages,
        ...(parsed.customMessages || {}),
        welcomeLines: Array.isArray(wl) ? wl.map((s) => String(s)) : base.customMessages.welcomeLines,
        triggerReplies: normTriggers(tr),
        lfgShortcuts: normalizeLfgShortcuts(parsed.customMessages?.lfgShortcuts),
        badWords: normalizeBadWords(parsed.customMessages?.badWords),
        welcomeCard: normalizeWelcomeCard(parsed.customMessages?.welcomeCard, base.customMessages.welcomeCard),
      },
      timeouts: { ...base.timeouts, ...(parsed.timeouts || {}) },
    };
    out.roles = applyMainConfigRoleOverlay(guildId, out.roles);
    return out;
  } catch {
    const rec = { ...defaultGuildRecord() };
    rec.channels = mergeChannelsWithOverlay(guildId, rec.channels);
    rec.roles = applyMainConfigRoleOverlay(guildId, rec.roles);
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
  normalizeBadWords,
};
