const { ensureBotData } = require('./tempVoice');

function touchVoiceJoin(client, guildId, userId, channelId, cfg) {
  const bd = ensureBotData(client);
  const key = `${guildId}:${userId}`;
  if (cfg.features?.afkMover === false) {
    bd.voiceJoinedAt.delete(key);
    return;
  }
  if (!channelId) {
    bd.voiceJoinedAt.delete(key);
    return;
  }

  const afkId = cfg.channels?.afkVoiceId;
  const lobbyId = cfg.channels?.lobbyVoiceId;
  if (channelId === afkId || channelId === lobbyId) {
    bd.voiceJoinedAt.delete(key);
    return;
  }

  const meta = bd.tempChannels.get(channelId);
  if (meta) {
    bd.voiceJoinedAt.delete(key);
    return;
  }

  bd.voiceJoinedAt.set(key, Date.now());
}

async function tickAfk(client, guild, cfg) {
  if (cfg.features?.afkMover === false) return;
  const minutes = Number(cfg.timeouts?.afkMinutes ?? 30);
  const ms = minutes * 60 * 1000;
  const afkId = cfg.channels?.afkVoiceId;
  if (!afkId) return;

  const afkCh = guild.channels.cache.get(afkId);
  if (!afkCh || !afkCh.isVoiceBased()) return;

  const bd = ensureBotData(client);
  const now = Date.now();

  for (const [key, started] of bd.voiceJoinedAt.entries()) {
    if (!key.startsWith(`${guild.id}:`)) continue;
    if (now - started < ms) continue;

    const userId = key.slice(`${guild.id}:`.length);
    const member = guild.members.cache.get(userId);
    if (!member?.voice?.channelId) {
      bd.voiceJoinedAt.delete(key);
      continue;
    }

    if (member.voice.channelId === afkId) {
      bd.voiceJoinedAt.delete(key);
      continue;
    }

    try {
      await member.voice.setChannel(afkCh, 'AFK süresi doldu');
    } catch {
      /* yetersiz yetki veya kullanıcı çıktı */
    }
    bd.voiceJoinedAt.delete(key);
  }
}

module.exports = { touchVoiceJoin, tickAfk };
