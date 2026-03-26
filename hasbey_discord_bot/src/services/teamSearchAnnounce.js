const { EmbedBuilder, ChannelType } = require('discord.js');

const LFG_HINT_TEAMS = 'Sende ekip arıyorsan `!teams` yazarak oyunları görebilirsin.';

function formatLfgUserReply(textChannel) {
  const mention = textChannel?.id ? `<#${textChannel.id}>` : 'bildirim kanalı';
  return `✅ Duyuru Gönderildi : ${mention}\n${LFG_HINT_TEAMS}`;
}

/** Üye Oyun kategorisindeki bir ses/stage kanalındaysa kanalı döner */
function voiceInPlayerCategory(member, playerCategoryId) {
  if (!member) return null;
  const vc = member.voice?.channel;
  if (!vc) return null;
  if (vc.type !== ChannelType.GuildVoice && vc.type !== ChannelType.GuildStageVoice) return null;
  const pid = playerCategoryId ? String(playerCategoryId).trim() : '';
  if (!pid) return null;
  const parent = vc.parentId ? String(vc.parentId).trim() : '';
  if (parent !== pid) return null;
  return vc;
}

/** Ekip arama duyurusu: Oyuncu Arama Bildirim Kanalı */
function resolveAnnounceChannel(guild, cfg) {
  const notifyId = cfg.channels?.araNotifyChannelId ? String(cfg.channels.araNotifyChannelId).trim() : '';
  if (!notifyId) return null;
  const c = guild.channels.cache.get(notifyId);
  return c?.isTextBased() ? c : null;
}

function buildEkipEmbed(member, { oyun, rank, mesaj, aranan = '1', voiceChannel }) {
  return new EmbedBuilder()
    .setTitle('📢 Ekip Lazım')
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 128 }) })
    .setDescription(mesaj)
    .addFields(
      { name: 'Aranan', value: String(aranan), inline: true },
      { name: 'Oyun', value: oyun, inline: true },
      { name: 'Rank', value: rank, inline: true },
      { name: 'Oda', value: `<#${voiceChannel.id}>`, inline: false }
    )
    .setFooter({ text: `${String(oyun).toUpperCase()} OYUNCUSU` })
    .setColor(0x57f287)
    .setTimestamp(new Date());
}

async function postTeamSearchAnnouncement({ guild, cfg, member, oyun, rank, mesaj, aranan = '1' }) {
  const playerCat = cfg.channels?.playerCategoryId;
  const vc = voiceInPlayerCategory(member, playerCat);
  if (!vc) {
    return { ok: false, reason: 'voice' };
  }

  const target = resolveAnnounceChannel(guild, cfg);
  if (!target) {
    return { ok: false, reason: 'channel' };
  }

  const embed = buildEkipEmbed(member, { oyun, rank, mesaj, aranan, voiceChannel: vc });

  const posted = await target.send({
    content: `— <@${member.id}>`,
    embeds: [embed],
  });

  return { ok: true, posted, target, vc };
}

module.exports = {
  LFG_HINT_TEAMS,
  formatLfgUserReply,
  voiceInPlayerCategory,
  resolveAnnounceChannel,
  postTeamSearchAnnouncement,
};
