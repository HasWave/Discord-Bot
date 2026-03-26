const { ActivityType } = require('discord.js');
const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup } = require('../lib/guards');

const VOICE_GO_LIVE_COOLDOWN_MS = 90_000;
const RICH_STREAM_COOLDOWN_MS = 180_000;

const voiceCooldown = new Map();
const richCooldown = new Map();

function passCooldown(map, key, ms) {
  const n = Date.now();
  const t = map.get(key) || 0;
  if (n - t < ms) return false;
  map.set(key, n);
  return true;
}

/** Ses kanalında “Go Live” / ekran paylaşımı açılınca */
async function announceVoiceGoLive(oldS, newS, guild, cfg) {
  if (cfg.features?.streamGoLiveAnnounce === false) return;
  const annId = cfg.channels?.streamAnnounceChannelId ? String(cfg.channels.streamAnnounceChannelId).trim() : '';
  if (!annId || !newS.channelId) return;
  if (!newS.streaming) return;
  if (oldS.streaming === true) return;

  if (!passCooldown(voiceCooldown, `${guild.id}:${newS.id}:vl`, VOICE_GO_LIVE_COOLDOWN_MS)) return;

  let member = newS.member;
  if (!member) {
    try {
      member = await guild.members.fetch(newS.id);
    } catch {
      return;
    }
  }
  if (member.user?.bot) return;

  const ch = guild.channels.cache.get(annId);
  if (!ch?.isTextBased()) return;

  const vc = guild.channels.cache.get(newS.channelId);
  const vcLine = vc ? `<#${vc.id}>` : 'ses kanalı';

  await ch
    .send({
      content: `🔴 **Yayın başladı** (Go Live / ekran paylaşımı) — ${member} → ${vcLine}`,
      allowedMentions: { users: [newS.id] },
    })
    .catch(() => {});
}

/** Discord durumunda “Yayında” (Twitch vb. URL) — Presence Intent gerekir */
async function announceRichStreamIfNeeded(oldPresence, newPresence) {
  const guild = newPresence.guild;
  const member = newPresence.member;
  if (!guild || !member || member.user.bot) return;

  const cfg = readGuildConfig(guild.id);
  if (!isGuildSetup(cfg) || cfg.features?.streamRichAnnounce !== true) return;

  const annId = cfg.channels?.streamAnnounceChannelId ? String(cfg.channels.streamAnnounceChannelId).trim() : '';
  if (!annId) return;

  const now = newPresence.activities?.find(
    (a) => a.type === ActivityType.Streaming && (a.url || a.name)
  );
  const was = oldPresence?.activities?.find((a) => a.type === ActivityType.Streaming);
  if (!now || was) return;

  const urlOrName = now.url || now.name || '';
  if (!passCooldown(richCooldown, `${guild.id}:${member.id}:${urlOrName}`, RICH_STREAM_COOLDOWN_MS)) return;

  const ch = guild.channels.cache.get(annId);
  if (!ch?.isTextBased()) return;

  const link = now.url ? now.url : `**${now.name}**`;
  await ch
    .send({
      content: `📺 **${member.user.tag}** yayına başladı (durum): ${link}`,
      allowedMentions: { users: [] },
    })
    .catch(() => {});
}

module.exports = { announceVoiceGoLive, announceRichStreamIfNeeded };
