const { ChannelType, PermissionFlagsBits } = require('discord.js');

function ensureBotData(client) {
  if (!client.botData) {
    client.botData = {
      pendingConfirm: new Map(),
      tempChannels: new Map(),
      voiceJoinedAt: new Map(),
      /** Geçici oda boşaltma zamanlayıcıları channelId -> Timeout */
      tempDeleteTimers: new Map(),
    };
  }
  if (!client.botData.tempDeleteTimers) client.botData.tempDeleteTimers = new Map();
  return client.botData;
}

function isTempChannel(client, channelId) {
  return ensureBotData(client).tempChannels.has(channelId);
}

function getTempMeta(client, channelId) {
  return ensureBotData(client).tempChannels.get(channelId);
}

async function createPersonalVoice(guild, owner, parentId, memberRoleId) {
  const everyone = guild.roles.everyone;
  const name = `🔊・${owner.displayName}`.slice(0, 90);

  /** Kayıtlı rol ID yoksa yalnızca oda sahibi + bot görür (arkadaşları içeri almak için menüden memberRoleId girin). */
  const allowMember = memberRoleId
    ? [
        {
          id: memberRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.UseVAD,
          ],
        },
      ]
    : [];

  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: parentId,
    permissionOverwrites: [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...allowMember,
      {
        id: owner.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.MoveMembers,
          PermissionFlagsBits.ManageChannels,
        ],
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ],
    reason: 'Geçici oda (➕ lobby)',
  });

  return ch;
}

function countInVoiceChannel(guild, channelId) {
  let n = 0;
  for (const vs of guild.voiceStates.cache.values()) {
    if (vs.channelId === channelId) n++;
  }
  return n;
}

/** Birisi tekrar odaya girince silme zamanlayıcısını iptal et */
function cancelTempChannelDeleteSchedule(client, channelId) {
  if (!channelId) return;
  const tid = ensureBotData(client).tempDeleteTimers.get(channelId);
  if (tid) {
    clearTimeout(tid);
    ensureBotData(client).tempDeleteTimers.delete(channelId);
  }
}

/**
 * Bot geçici odayı hatırlıyorsa, üye ayrılınca kısa gecikmeyle tekrar sayar (cache gecikmesi).
 * Odaya kimse kalmadıysa siler.
 */
async function tryDeleteIfEmpty(client, channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  const meta = getTempMeta(client, channel.id);
  if (!meta) return;

  const guild = channel.guild;
  const cid = channel.id;
  const timers = ensureBotData(client).tempDeleteTimers;

  const attemptDelete = async () => {
    timers.delete(cid);
    if (!getTempMeta(client, cid)) return;
    if (countInVoiceChannel(guild, cid) > 0) return;
    const ch = guild.channels.cache.get(cid) || (await guild.channels.fetch(cid).catch(() => null));
    if (!ch || ch.type !== ChannelType.GuildVoice) return;
    if (!getTempMeta(client, cid)) return;
    if (countInVoiceChannel(guild, cid) > 0) return;
    ensureBotData(client).tempChannels.delete(cid);
    await ch.delete('Geçici oda boşaldı').catch(() => {});
  };

  const prev = timers.get(cid);
  if (prev) clearTimeout(prev);

  timers.set(
    cid,
    setTimeout(() => {
      attemptDelete().catch(() => {});
    }, 1800)
  );
}

async function setLocked(channel, memberRoleId, locked) {
  await channel.permissionOverwrites.edit(memberRoleId, {
    Connect: !locked,
  });
}

const TEMP_OWNER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.ManageChannels,
];

const TEMP_MEMBER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.UseVAD,
];

async function setTempChannelOwner(channel, oldOwnerId, newOwnerId) {
  if (oldOwnerId && oldOwnerId !== newOwnerId) {
    await channel.permissionOverwrites.edit(oldOwnerId, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      UseVAD: true,
      MuteMembers: false,
      DeafenMembers: false,
      MoveMembers: false,
      ManageChannels: false,
    });
  }
  await channel.permissionOverwrites.edit(newOwnerId, {
    ViewChannel: true,
    Connect: true,
    Speak: true,
    UseVAD: true,
    MuteMembers: true,
    DeafenMembers: true,
    MoveMembers: true,
    ManageChannels: true,
  });
}

module.exports = {
  ensureBotData,
  isTempChannel,
  getTempMeta,
  createPersonalVoice,
  tryDeleteIfEmpty,
  cancelTempChannelDeleteSchedule,
  setLocked,
  setTempChannelOwner,
  TEMP_OWNER_ALLOW,
  TEMP_MEMBER_ALLOW,
};
