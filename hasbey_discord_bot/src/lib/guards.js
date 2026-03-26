const { PermissionFlagsBits, ChannelType } = require('discord.js');

function isGuildSetup(cfg) {
  return Boolean(cfg?.setupComplete && cfg?.botOwnerId);
}

function canOperateServer(member, cfg) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (cfg.botOwnerId && member.id === cfg.botOwnerId) return true;
  return false;
}

/**
 * /kur: Discord’da henüz HasBEY şablonu yokken, yapı “boş veya minimal” sayılabilir mi.
 * Zaten KAYIT kategorisi veya çok sayıda kanal/rol varsa kurulmaz.
 */
function isGuildBareForKur(guild) {
  const hasKayit = guild.channels.cache.some(
    (c) => c.type === ChannelType.GuildCategory && c.name === 'KAYIT'
  );
  if (hasKayit) return false;

  let categories = 0;
  let texts = 0;
  let voices = 0;
  let other = 0;
  for (const ch of guild.channels.cache.values()) {
    switch (ch.type) {
      case ChannelType.GuildCategory:
        categories++;
        break;
      case ChannelType.GuildText:
      case ChannelType.GuildAnnouncement:
      case ChannelType.GuildForum:
        texts++;
        break;
      case ChannelType.GuildVoice:
      case ChannelType.GuildStageVoice:
        voices++;
        break;
      default:
        other++;
        break;
    }
  }

  let customRoles = 0;
  for (const r of guild.roles.cache.values()) {
    if (r.id === guild.id) continue;
    if (r.managed) continue;
    customRoles++;
  }

  const structure = categories + texts + voices + other;
  if (structure > 6) return false;
  if (customRoles > 3) return false;

  return true;
}

module.exports = { isGuildSetup, canOperateServer, isGuildBareForKur };
