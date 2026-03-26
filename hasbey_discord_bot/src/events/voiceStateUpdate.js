const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup } = require('../lib/guards');
const { resolveMemberRoleId } = require('../lib/resolveRoles');
const {
  createPersonalVoice,
  ensureBotData,
  tryDeleteIfEmpty,
  cancelTempChannelDeleteSchedule,
} = require('../services/tempVoice');
const { touchVoiceJoin } = require('../services/afk');
const { bumpVoiceJoin } = require('../lib/stats');
const { announceVoiceGoLive } = require('../services/streamAnnounce');

module.exports = async function onVoiceStateUpdate(oldS, newS, client) {
  const guild = newS.guild;
  const cfg = readGuildConfig(guild.id);
  if (!isGuildSetup(cfg)) return;

  await announceVoiceGoLive(oldS, newS, guild, cfg);

  if (newS.channelId) {
    cancelTempChannelDeleteSchedule(client, newS.channelId);
  }

  if (oldS.channelId && oldS.channelId !== newS.channelId) {
    const oldCh = guild.channels.cache.get(oldS.channelId);
    if (oldCh) await tryDeleteIfEmpty(client, oldCh);
  }

  touchVoiceJoin(client, guild.id, newS.id, newS.channelId, cfg);

  if (newS.channelId && newS.channelId !== oldS.channelId) {
    bumpVoiceJoin(guild.id, newS.channelId);
  }

  if (cfg.features?.tempVoiceFromLobby === false) return;

  const lobbyId = String(cfg.channels?.lobbyVoiceId || '').trim();
  const joiningId = newS.channelId ? String(newS.channelId).trim() : '';
  const oldChId = oldS.channelId ? String(oldS.channelId).trim() : '';
  const tempCat = cfg.channels?.tempCategoryId ? String(cfg.channels.tempCategoryId).trim() : '';
  if (lobbyId && joiningId === lobbyId && joiningId !== oldChId && tempCat) {
    let member = newS.member;
    if (!member) {
      try {
        member = await guild.members.fetch({ user: newS.id, force: false });
      } catch {
        return;
      }
    }
    if (!member || member.user.bot) return;

    const memberRoleId = resolveMemberRoleId(guild, cfg);
    if (!memberRoleId) {
      console.warn(
        `[voice] ${guild.id}: Kayıtlı rolü ID/isimle çözülemedi; oda yalnızca sahip için açılacak. Menüde memberRoleName doğru mu?`
      );
    }

    let ch;
    try {
      ch = await createPersonalVoice(guild, member, tempCat, memberRoleId);
      ensureBotData(client).tempChannels.set(ch.id, {
        ownerId: member.id,
        guildId: guild.id,
        locked: false,
      });
      await member.voice.setChannel(ch);
    } catch (e) {
      console.error('[voice] Geçici oda oluşturulamadı:', e);
      if (ch) await ch.delete().catch(() => {});
    }
  }
};
