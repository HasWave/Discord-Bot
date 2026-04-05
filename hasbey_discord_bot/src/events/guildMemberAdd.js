const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { readGuildConfig, writeGuildConfig } = require('../lib/storage');
const { isJoinOnboardingReady } = require('../lib/guards');
const { resolveGuestRoleId, resolveMemberRoleId } = require('../lib/resolveRoles');
const { resolveWelcomeChannelId } = require('../lib/resolveChannels');
const { recordJoin } = require('../lib/stats');
const { queueMemberCountUpdate } = require('../services/channelStatus');
const { createWelcomeCard } = require('../services/welcomeCard');
const { syncGuestChannelRestrictions } = require('../services/guestChannelSync');
const { TEMPLATE_GUEST_ROLE_NAME } = require('../services/defaultTemplate');

function parseHexColor(input, fallback = 0xfee75c) {
  const raw = String(input || '')
    .trim()
    .replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return fallback;
  return parseInt(raw, 16);
}

async function ensureGuestRoleForRegistration(guild, cfg) {
  await guild.roles.fetch().catch(() => {});
  let guestId = resolveGuestRoleId(guild, cfg);
  if (guestId) return guestId;

  const name = String(cfg.roles?.guestRoleName || TEMPLATE_GUEST_ROLE_NAME).slice(0, 100);
  let role = guild.roles.cache.find((r) => r.name === name && !r.managed);
  if (
    !role &&
    guild.members.me?.permissions?.has(PermissionFlagsBits.ManageRoles)
  ) {
    try {
      role = await guild.roles.create({
        name,
        permissions: [],
        hoist: false,
        reason: 'HasBEY: kayıt akışı — misafir rolü yoktu',
      });
      await role
        .setPosition(1, { relative: false, reason: 'HasBEY: misafir rolü en alta' })
        .catch(() => {});
    } catch (e) {
      console.warn(`[guildMemberAdd] misafir rolü oluşturulamadı (${guild.name}): ${e.message}`);
      return null;
    }
  }
  if (!role) return null;

  const next = readGuildConfig(guild.id);
  next.roles = { ...next.roles, guestRoleId: role.id };
  writeGuildConfig(guild.id, next);
  await guild.channels.fetch().catch(() => {});
  await syncGuestChannelRestrictions(guild, readGuildConfig(guild.id), { staggerMs: 80 }).catch(() => {});
  return role.id;
}

module.exports = async function onGuildMemberAdd(member) {
  recordJoin(member.guild.id, { userId: member.id, tag: member.user.tag });

  let cfg = readGuildConfig(member.guild.id);
  queueMemberCountUpdate(member.client, member.guild);

  const onboarding = isJoinOnboardingReady(cfg, member.guild);

  if (!member.user.bot) {
    const guestRoleId = await ensureGuestRoleForRegistration(member.guild, cfg);
    cfg = readGuildConfig(member.guild.id);
    const memberRoleId = resolveMemberRoleId(member.guild, cfg);
    if (memberRoleId && member.roles.cache.has(memberRoleId)) {
      try {
        await member.roles.remove(memberRoleId, 'Kayıt akışı: önce misafir');
      } catch (e) {
        console.warn(`[guildMemberAdd] teşkilat rolü alınamadı (${member.user.tag}): ${e.message}`);
      }
    }
    if (guestRoleId) {
      try {
        await member.roles.add(guestRoleId, 'Yeni üye — Misafir (yeniden katılım dahil)');
        await member.guild.channels.fetch().catch(() => {});
        await syncGuestChannelRestrictions(member.guild, readGuildConfig(member.guild.id), {
          staggerMs: 80,
        }).catch(() => {});
      } catch (e) {
        console.warn(`[guildMemberAdd] misafir rolü verilemedi (üye ${member.user.tag}): ${e.message}`);
      }
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
    'Hoş geldin! Şu an **misafir** olarak **Sunucu durumu** bölümündeki kanalları görebilirsin (gelen-var kanalına yazı yazılamaz; sistem giriş/çıkış mesajları oraya düşer).\n\n' +
    '**Kayıt:** Aşağıdaki **Kayıt Ol** butonuna tıkla — **teşkilat** rolünü alırsın, misafir rolün kalkar; ek form yok. Diğer kanallar açılır.\n\n' +
    'Komut listesi için (izin verilen kanallarda): `/komutlar`';
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

  await ch
    .send({
      content: `${member}`,
      embeds: [embed],
      files,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('hby:kaydol_open').setLabel('Kayıt Ol').setStyle(ButtonStyle.Primary)
        ),
      ],
    })
    .catch(() => {});
};
