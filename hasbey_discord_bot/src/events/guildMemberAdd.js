const { PermissionFlagsBits } = require('discord.js');
const { readGuildConfig, writeGuildConfig } = require('../lib/storage');
const { isJoinOnboardingReady } = require('../lib/guards');
const { resolveGuestRoleId, resolveMemberRoleId } = require('../lib/resolveRoles');
const { recordJoin } = require('../lib/stats');
const { queueMemberCountUpdate } = require('../services/channelStatus');
const { syncGuestChannelRestrictions } = require('../services/guestChannelSync');
const { sendJoinWelcomeMessage } = require('../services/joinWelcomeMessage');
const { TEMPLATE_GUEST_ROLE_NAME } = require('../services/defaultTemplate');

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
  await sendJoinWelcomeMessage(member, readGuildConfig(member.guild.id));
};
