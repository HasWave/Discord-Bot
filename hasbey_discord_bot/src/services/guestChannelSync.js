const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { resolveGuestRoleId } = require('../lib/resolveRoles');

function addSnowflake(set, id) {
  const t = id != null ? String(id).trim() : '';
  if (/^\d{10,25}$/.test(t)) set.add(t);
}

/** Giriş/çıkış sistem mesajları (şablonda genelde Sunucu Durumu → gelen-var; guild.systemChannel ile eşleşir) */
function collectJoinNoticeChannelIds(guild, cfg) {
  const s = new Set();
  if (guild.systemChannelId) s.add(guild.systemChannelId);
  addSnowflake(s, cfg.channels?.joinNoticeChannelId);
  return s;
}

/** Kayıt akışı açıkken misafirin görebileceği kanallar */
function collectGuestAllowChannelIds(guild, cfg) {
  const s = collectJoinNoticeChannelIds(guild, cfg);
  addSnowflake(s, cfg.channels?.guestSlashCommandsChannelId);
  addSnowflake(s, cfg.channels?.lastRegisteredDisplayChannelId);
  addSnowflake(s, cfg.channels?.memberCountChannelId);
  return s;
}

/**
 * Misafir rolüne göre tüm kanallarda izinleri günceller.
 * - İzin verilenler: gelen-var (salt okunur), misafir bot komut, son kayıt / üye sayısı sesleri (yalnız görünür).
 * - Diğer tüm kanallar: misafir için ViewChannel kapalı.
 */
async function syncGuestChannelRestrictions(guild, cfg, { staggerMs = 100 } = {}) {
  const guestId = resolveGuestRoleId(guild, cfg);
  if (!guestId) return;

  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) return;

  const allowIds = collectGuestAllowChannelIds(guild, cfg);
  const joinNoticeIds = collectJoinNoticeChannelIds(guild, cfg);
  const guestSlashId = cfg.channels?.guestSlashCommandsChannelId
    ? String(cfg.channels.guestSlashCommandsChannelId).trim()
    : '';

  const isJoinNoticeTextChannel = (ch) => {
    if (!joinNoticeIds.has(ch.id)) return false;
    if (guestSlashId && ch.id === guestSlashId) return false;
    return true;
  };

  for (const ch of guild.channels.cache.values()) {
    if (
      ch.type === ChannelType.PublicThread ||
      ch.type === ChannelType.PrivateThread ||
      ch.type === ChannelType.AnnouncementThread
    ) {
      continue;
    }
    if (ch.type === ChannelType.GuildCategory) continue;
    if (!ch.manageable) continue;

    const inAllow = allowIds.has(ch.id);

    try {
      if (inAllow) {
        if (ch.isTextBased()) {
          if (isJoinNoticeTextChannel(ch)) {
            await ch.permissionOverwrites.edit(
              guestId,
              {
                ViewChannel: true,
                ReadMessageHistory: true,
                SendMessages: false,
                SendMessagesInThreads: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false,
                AddReactions: false,
                AttachFiles: false,
                EmbedLinks: false,
                UseExternalEmojis: false,
                UseExternalStickers: false,
                UseApplicationCommands: false,
              },
              { reason: 'HasBEY: misafir — gelen-var salt okunur' }
            );
          } else {
            await ch.permissionOverwrites.edit(
              guestId,
              {
                ViewChannel: true,
                ReadMessageHistory: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                AttachFiles: true,
                EmbedLinks: true,
                AddReactions: true,
                UseApplicationCommands: true,
              },
              { reason: 'HasBEY: misafir bot komut kanalı' }
            );
          }
        } else if (
          ch.type === ChannelType.GuildVoice ||
          ch.type === ChannelType.GuildStageVoice
        ) {
          await ch.permissionOverwrites.edit(
            guestId,
            {
              ViewChannel: true,
              Connect: false,
              Speak: false,
              UseVAD: false,
              Stream: false,
            },
            { reason: 'HasBEY: misafir — istatistik ses (yalnız görünür)' }
          );
        }
      } else {
        await ch.permissionOverwrites.edit(
          guestId,
          { ViewChannel: false },
          { reason: 'HasBEY: misafir — diğer kanallar gizli' }
        );
      }
      if (staggerMs > 0) await new Promise((r) => setTimeout(r, staggerMs));
    } catch (e) {
      console.warn(`[guestChannelSync] ${guild.id} kanal ${ch.id}: ${e.message}`);
    }
  }
}

module.exports = {
  syncGuestChannelRestrictions,
  collectGuestAllowChannelIds,
  collectJoinNoticeChannelIds,
};
