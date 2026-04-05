const { PermissionFlagsBits } = require('discord.js');
const { readGuildConfig } = require('../lib/storage');
const { resolveGuestRoleId, resolveMemberRoleId } = require('../lib/resolveRoles');
const { syncGuestChannelRestrictions } = require('./guestChannelSync');
const { sendJoinWelcomeMessage } = require('./joinWelcomeMessage');

function shouldSkipGuestBulk(member, guild, memberRoleId, ownerRoleId, adminRoleId) {
  if (member.user.bot) return true;
  if (member.id === guild.ownerId) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (ownerRoleId && member.roles?.cache?.has(ownerRoleId)) return true;
  if (adminRoleId && member.roles?.cache?.has(adminRoleId)) return true;
  if (memberRoleId && member.roles?.cache?.has(memberRoleId)) return true;
  return false;
}

/**
 * /kur veya yedekten kurulum bittikten sonra: mevcut üyelere misafir rolü + bot komut kanalında karşılama.
 * Yeni gelen / tekrar giren üyeler için `guildMemberAdd` aynı mantığı sürdürür.
 */
async function runPostKurGuestRoleAndWelcome(guild) {
  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});
  await guild.members.fetch().catch(() => {});

  const cfg = readGuildConfig(guild.id);
  const guestId = resolveGuestRoleId(guild, cfg);
  const memberRoleId = resolveMemberRoleId(guild, cfg);
  const ownerRoleId = cfg?.roles?.ownerRoleId ? String(cfg.roles.ownerRoleId).trim() : '';
  const adminRoleId = cfg?.roles?.adminRoleId ? String(cfg.roles.adminRoleId).trim() : '';

  if (!guestId) {
    console.warn(`[postKur] ${guild.id}: misafir rolü çözülemedi; toplu misafir atlandı.`);
    return;
  }

  await syncGuestChannelRestrictions(guild, readGuildConfig(guild.id), { staggerMs: 80 }).catch(() => {});

  for (const member of guild.members.cache.values()) {
    if (shouldSkipGuestBulk(member, guild, memberRoleId, ownerRoleId, adminRoleId)) continue;
    if (!member.roles.cache.has(guestId)) {
      await member.roles.add(guestId, 'HasBEY şablon/kur sonrası — misafir').catch(() => {});
    }
  }

  if (cfg.features?.welcomeOnJoin === false) return;

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const freshCfg = readGuildConfig(guild.id);

  for (const member of guild.members.cache.values()) {
    if (shouldSkipGuestBulk(member, guild, memberRoleId, ownerRoleId, adminRoleId)) continue;
    if (!member.roles.cache.has(guestId)) continue;
    await sendJoinWelcomeMessage(member, freshCfg);
    await delay(450);
  }
}

module.exports = { runPostKurGuestRoleAndWelcome };
