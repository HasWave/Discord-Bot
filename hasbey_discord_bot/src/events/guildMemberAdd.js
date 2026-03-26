const { EmbedBuilder } = require('discord.js');
const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup } = require('../lib/guards');
const { resolveGuestRoleId } = require('../lib/resolveRoles');
const { resolveWelcomeChannelId } = require('../lib/resolveChannels');
const { recordJoin } = require('../lib/stats');
const { queueMemberCountUpdate } = require('../services/channelStatus');

module.exports = async function onGuildMemberAdd(member) {
  recordJoin(member.guild.id, { userId: member.id, tag: member.user.tag });

  const cfg = readGuildConfig(member.guild.id);
  queueMemberCountUpdate(member.client, member.guild);

  const guestRoleId = resolveGuestRoleId(member.guild, cfg);
  if (isGuildSetup(cfg) && guestRoleId && !member.user.bot) {
    try {
      await member.roles.add(guestRoleId, 'Yeni üye — Misafir');
    } catch {
      /* hiyerarşi / yetki */
    }
  }

  if (!isGuildSetup(cfg)) return;
  if (cfg.features?.welcomeOnJoin === false) return;
  const welcomeChId = resolveWelcomeChannelId(cfg);
  if (!welcomeChId) return;

  const ch = member.guild.channels.cache.get(welcomeChId);
  if (!ch?.isTextBased()) return;

  const lines = cfg.customMessages?.welcomeLines;
  const defaultDesc =
    'Hoş geldin! Sunucu odalarını görmek için önce kayıt olmalısın.\n\n' +
    '**Kayıt:** `/kaydol` — formda **ad soyad**, **takma ad** ve **yaş** istenir. Sunucu adın **Takma ad | yaş** yapılması eklentiden açılıp kapatılabilir. Discord **kullanıcı adın** otomatik değişmez.\n\n' +
    'Slash komutların kanalı: `/komutlar`';
  let description = defaultDesc;
  if (Array.isArray(lines) && lines.length > 0) {
    const sub = (s) =>
      String(s)
        .replaceAll('{member}', String(member))
        .replaceAll('{username}', member.user.username)
        .replaceAll('{tag}', member.user.tag);
    description = lines.map(sub).join('\n');
  }

  const embed = new EmbedBuilder()
    .setTitle('👋 Hoş geldin')
    .setDescription(description)
    .setColor(0xfee75c)
    .setTimestamp(new Date());

  await ch.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
};
