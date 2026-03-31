const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { readGuildConfig } = require('../lib/storage');
const { isJoinOnboardingReady } = require('../lib/guards');
const { resolveGuestRoleId } = require('../lib/resolveRoles');
const { resolveWelcomeChannelId } = require('../lib/resolveChannels');
const { recordJoin } = require('../lib/stats');
const { queueMemberCountUpdate } = require('../services/channelStatus');
const { createWelcomeCard } = require('../services/welcomeCard');

function parseHexColor(input, fallback = 0xfee75c) {
  const raw = String(input || '')
    .trim()
    .replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return fallback;
  return parseInt(raw, 16);
}

module.exports = async function onGuildMemberAdd(member) {
  recordJoin(member.guild.id, { userId: member.id, tag: member.user.tag });

  const cfg = readGuildConfig(member.guild.id);
  queueMemberCountUpdate(member.client, member.guild);

  const onboarding = isJoinOnboardingReady(cfg, member.guild);
  const guestRoleId = resolveGuestRoleId(member.guild, cfg);
  if (onboarding && guestRoleId && !member.user.bot) {
    try {
      await member.roles.add(guestRoleId, 'Yeni üye — Misafir (yeniden katılım dahil)');
    } catch (e) {
      console.warn(`[guildMemberAdd] misafir rolü verilemedi (üye ${member.user.tag}): ${e.message}`);
    }
  }

  if (!onboarding) return;
  if (cfg.features?.welcomeOnJoin === false) return;
  const welcomeChId = resolveWelcomeChannelId(cfg);
  if (!welcomeChId) return;

  let ch = member.guild.channels.cache.get(welcomeChId);
  if (!ch) {
    ch = await member.guild.channels.fetch(welcomeChId).catch(() => null);
  }
  if (!ch?.isTextBased()) {
    console.warn(
      `[guildMemberAdd] hoş geldin kanalı bulunamadı veya metin kanalı değil: ${welcomeChId} (${member.guild.name})`
    );
    return;
  }

  const lines = cfg.customMessages?.welcomeLines;
  const defaultDesc =
    'Hoş geldin! Sunucu odalarını görmek için önce kayıt olmalısın.\n\n' +
    '**Kayıt:** aşağıdaki **Kayıt Ol** butonuna tıkla (veya `/kaydol`). Formda **ad soyad**, **takma ad** ve **yaş** istenir. Sunucu adın **Takma ad | yaş** yapılması eklentiden açılıp kapatılabilir. Discord **kullanıcı adın** otomatik değişmez.\n\n' +
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

  const card = cfg.customMessages?.welcomeCard || {};
  const imageUrl = String(card.imageUrl || '').trim();
  const embed = new EmbedBuilder()
    .setTitle(String(card.title || '👋 Hoş geldin').slice(0, 120))
    .setDescription(description)
    .setColor(parseHexColor(card.color))
    .setTimestamp(new Date());
  const files = [];
  try {
    const cardBuffer = await createWelcomeCard(member, cfg);
    const imageFile = new AttachmentBuilder(cardBuffer, { name: 'welcome-card.png' });
    files.push(imageFile);
    embed.setImage('attachment://welcome-card.png');
  } catch {
    if (imageUrl) embed.setImage(imageUrl);
  }

  const registerRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hby:kaydol_open').setLabel('Kayıt Ol').setStyle(ButtonStyle.Primary)
  );

  await ch.send({ content: `${member}`, embeds: [embed], components: [registerRow], files }).catch(() => {});
};
