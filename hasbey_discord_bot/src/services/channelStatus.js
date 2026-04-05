const { ensureBotData } = require('./tempVoice');
const { readGuildConfig } = require('../lib/storage');

const DISPLAY_PREFIX = '「👤」';
const MEMBER_COUNT_DEBOUNCE_MS = 90_000;
/** Discord kanal adı güncelleme hız sınırı: aynı kanal için çok sık denememek için */
const MIN_RENAME_GAP_MS = 620_000;

function channelRenameKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

function formatMemberCountDisplay(n) {
  return `${DISPLAY_PREFIX}${n}`.slice(0, 100);
}

function formatLastRegisteredDisplay(rawName) {
  const clean = String(rawName || '')
    .replace(/[\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${DISPLAY_PREFIX}${clean || '—'}`.slice(0, 100);
}

function canRenameChannel(client, guildId, channelId) {
  const bd = ensureBotData(client);
  if (!bd.channelLastRename) bd.channelLastRename = new Map();
  const t = bd.channelLastRename.get(channelRenameKey(guildId, channelId)) ?? 0;
  return Date.now() - t >= MIN_RENAME_GAP_MS;
}

function markChannelRenamed(client, guildId, channelId) {
  const bd = ensureBotData(client);
  if (!bd.channelLastRename) bd.channelLastRename = new Map();
  bd.channelLastRename.set(channelRenameKey(guildId, channelId), Date.now());
}

async function safeSetChannelName(channel, name, reason) {
  if (!channel?.setName || channel.name === name) return;
  await channel.setName(name, reason);
}

/**
 * Üye sayısı kanalını anında günceller (hazırsa ve süre uygunsa).
 */
async function syncMemberCountChannel(client, guild) {
  const cfg = readGuildConfig(guild.id);
  if (cfg.features?.memberCountChannel === false) return;
  const id = cfg.channels?.memberCountChannelId;
  if (!id) return;

  const ch = guild.channels.cache.get(id);
  if (!ch) return;

  const next = formatMemberCountDisplay(guild.memberCount ?? guild.members.cache.size);
  if (ch.name === next) return;

  if (!canRenameChannel(client, guild.id, id)) return;

  try {
    await safeSetChannelName(ch, next, 'HasBEY üye sayısı');
    markChannelRenamed(client, guild.id, id);
  } catch {
    /* 429 / yetki */
  }
}

/**
 * Son kayıt olanın adını gösteren kanal adı (genelde ses kanalı).
 */
async function updateLastRegisteredDisplay(client, guild, cfg, displayName) {
  if (cfg.features?.lastRegisteredDisplay === false) return;
  const id = cfg.channels?.lastRegisteredDisplayChannelId;
  if (!id) return;

  const ch = guild.channels.cache.get(id);
  if (!ch) return;

  const next = formatLastRegisteredDisplay(displayName);
  if (ch.name === next) return;

  try {
    await safeSetChannelName(ch, next, 'HasBEY son kayıt');
  } catch {
    /* 429 / yetki */
  }
}

function queueMemberCountUpdate(client, guild) {
  const cfg = readGuildConfig(guild.id);
  if (cfg.features?.memberCountChannel === false) return;
  if (!cfg.channels?.memberCountChannelId) return;

  const bd = ensureBotData(client);
  if (!bd.memberCountTimers) bd.memberCountTimers = new Map();

  const existing = bd.memberCountTimers.get(guild.id);
  if (existing) clearTimeout(existing);

  const t = setTimeout(() => {
    bd.memberCountTimers.delete(guild.id);
    syncMemberCountChannel(client, guild).catch(() => {});
  }, MEMBER_COUNT_DEBOUNCE_MS);

  bd.memberCountTimers.set(guild.id, t);
}

module.exports = {
  formatMemberCountDisplay,
  formatLastRegisteredDisplay,
  syncMemberCountChannel,
  updateLastRegisteredDisplay,
  queueMemberCountUpdate,
};
