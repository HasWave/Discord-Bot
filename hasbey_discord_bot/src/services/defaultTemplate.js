const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { defaultFeatures, defaultCustomMessages } = require('../lib/storage');

/** Varsayılan şablonda oluşturulan misafir rolünün tam adı (ID kurulumda Discord’dan atanır). */
const TEMPLATE_GUEST_ROLE_NAME = '👤 ᴍɪꜱᴀꜰɪʀ';

async function deleteAllChannelsAndRoles(guild) {
  const channels = [...guild.channels.cache.values()];
  for (const ch of channels) {
    await ch.delete('HasBEY temiz kurulum').catch(() => {});
  }

  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed && r.editable)
    .sort((a, b) => b.position - a.position);
  for (const role of roles) {
    await role.delete('HasBEY temiz kurulum').catch(() => {});
  }
}

/**
 * @param {boolean} [hoist=false] Üye listesinde rol başlığı altında gruplama. Açıkken misafirler diğer rollerin aktif üyelerini ayrı bloklarda net görür; kapalı tutmak gizliliği artırır (isimler yine listelenebilir — Discord bunu tamamen kapatmıyor).
 */
async function createRole(guild, name, permissions = 0n, hoist = false) {
  return guild.roles.create({
    name,
    permissions,
    hoist,
    reason: 'HasBEY varsayilan sablon',
  });
}

/** Aynı rol için çakışan overwrite satırlarını birleştirir (ör. görüntüle kategori + bağlan ses). */
function mergePermissionOverwrites(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const ow of list) {
      const cur = map.get(ow.id) || { id: ow.id };
      const allow = new Set(cur.allow || []);
      const deny = new Set(cur.deny || []);
      for (const a of ow.allow || []) allow.add(a);
      for (const d of ow.deny || []) deny.add(d);
      map.set(ow.id, { id: ow.id, allow: [...allow], deny: [...deny] });
    }
  }
  return [...map.values()].map(({ id, allow, deny }) => {
    const o = { id };
    if (allow.length) o.allow = allow;
    if (deny.length) o.deny = deny;
    return o;
  });
}

async function installDefaultTemplate(guild, botOwnerId) {
  const initialMemberCount = Number.isFinite(guild.memberCount)
    ? guild.memberCount
    : guild.members?.cache?.size || 0;

  const roles = {};
  roles.owner = await createRole(guild, '👑 ᴏᴡɴᴇʀ', PermissionFlagsBits.Administrator);
  roles.admin = await createRole(
    guild,
    '🛡️ ᴀᴅᴍɪɴ',
    PermissionFlagsBits.ManageGuild |
      PermissionFlagsBits.ManageChannels |
      PermissionFlagsBits.ManageRoles |
      PermissionFlagsBits.ManageMessages |
      PermissionFlagsBits.KickMembers
  );
  roles.mod = await createRole(guild, '⚒️ ᴍᴏᴅ', PermissionFlagsBits.ManageMessages);
  roles.trialMod = await createRole(guild, '🧪 ᴛʀɪᴀʟ ᴍᴏᴅ', PermissionFlagsBits.ManageMessages);
  roles.destek = await createRole(guild, '🎧 ᴅᴇꜱᴛᴇᴋ ᴇᴋɪʙɪ');
  roles.etkinlik = await createRole(guild, '🎉 ᴇᴛᴋɪɴʟɪᴋ ꜱᴏʀᴜᴍʟᴜꜱᴜ');
  roles.streamer = await createRole(guild, '🛰️ ꜱᴛʀᴇᴀᴍᴇʀ');
  roles.developer = await createRole(guild, '💻 ᴅᴇᴠᴇʟᴏᴘᴇʀ');
  roles.vip = await createRole(guild, '💎 ᴠɪᴘ');
  roles.botTag = await createRole(guild, '🤖 ʙᴏᴛ');
  roles.hanim = await createRole(guild, '🧸 ʜᴀɴıᴍ ᴇꜰᴇɴᴅɪʟᴇʀ');
  roles.drama = await createRole(guild, '🎭 ᴅʀᴀᴍᴀ Qᴜᴇɴ');
  /** Teşkilat ve misafir: üye listesinde ayrı rol başlığı (çevrimiçi olduklarında kendi bloklarında görünür). */
  roles.member = await createRole(guild, '🎖️ ᴛᴇꜱ̧ᴋɪʟᴀᴛ', 0n, true);
  roles.guest = await createRole(guild, TEMPLATE_GUEST_ROLE_NAME, 0n, true);

  const meId = guild.members.me?.id;

  const readonlyTextDenies = [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.CreatePrivateThreads,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseExternalEmojis,
    PermissionFlagsBits.UseExternalStickers,
  ];

  const ownerAdminOnly = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.owner.id, allow: [PermissionFlagsBits.ViewChannel] },
    { id: roles.admin.id, allow: [PermissionFlagsBits.ViewChannel] },
  ];
  if (meId) {
    ownerAdminOnly.push({
      id: meId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
    });
  }

  const staffWriteRoleIds = [
    roles.owner.id,
    roles.admin.id,
    roles.mod.id,
    roles.trialMod.id,
    roles.destek.id,
    roles.etkinlik.id,
  ];

  /** Kanalları görmesi gereken personel / özel roller (üyelik dışı). */
  const staffChannelViewIds = [
    roles.owner.id,
    roles.admin.id,
    roles.mod.id,
    roles.trialMod.id,
    roles.destek.id,
    roles.etkinlik.id,
    roles.streamer.id,
    roles.developer.id,
    roles.vip.id,
    roles.botTag.id,
    roles.hanim.id,
    roles.drama.id,
  ];
  const staffChannelViewAllow = staffChannelViewIds.map((id) => ({
    id,
    allow: [PermissionFlagsBits.ViewChannel],
  }));

  /**
   * Üye alanları: @everyone ve misafir görünmez; kayıtlı üye + personel görür.
   * Yalnızca “misafire red” kullanmak, sunucuda @everyone görüntüleme açıkken yetersiz kalabiliyordu.
   */
  const memberOnlyCategory = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.guest.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.member.id, allow: [PermissionFlagsBits.ViewChannel] },
    ...staffChannelViewAllow,
  ];

  /** Kayıt / hoş geldin kategorisi: misafir ve üye görür; ham @everyone görmez. */
  const registrationCategoryOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.guest.id, allow: [PermissionFlagsBits.ViewChannel] },
    { id: roles.member.id, allow: [PermissionFlagsBits.ViewChannel] },
    ...staffChannelViewAllow,
  ];

  const restrictedTextOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.guest.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: roles.member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: readonlyTextDenies,
    },
    ...staffWriteRoleIds.map((id) => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
      ],
    })),
  ];

  const notifyReadonlyOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.guest.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: roles.member.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: readonlyTextDenies,
    },
    {
      id: roles.botTag.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    ...staffWriteRoleIds.map((id) => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.AddReactions,
      ],
    })),
  ];
  if (meId) {
    notifyReadonlyOverwrites.push({
      id: meId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  /** Gelen-var: kategori izinlerine ek olarak gönderim kapalı. */
  const registrationGelenReadonlyOverwrites = [
    {
      id: roles.guest.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: readonlyTextDenies,
    },
    {
      id: roles.member.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: readonlyTextDenies,
    },
    ...staffWriteRoleIds.map((id) => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
      ],
    })),
  ];
  const lockedStatVoiceOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    },
  ];

  const channels = {};
  const create = (opts) => guild.channels.create({ ...opts, reason: 'HasBEY varsayilan sablon' });

  const catStatus = await create({
    name: '📶 ꜱᴜɴᴜᴄᴜ ᴅᴜʀᴜᴍᴜ',
    type: ChannelType.GuildCategory,
    permissionOverwrites: registrationCategoryOverwrites,
  });
  channels.gelenVar = await create({
    name: '「🔔」ɢᴇʟᴇɴ-ᴠᴀʀ',
    type: ChannelType.GuildText,
    parent: catStatus.id,
    permissionOverwrites: registrationGelenReadonlyOverwrites,
  });
  await guild
    .setSystemChannel(channels.gelenVar.id, 'HasBEY sistem mesaj kanali')
    .catch(() => {});
  channels.guestBot = await create({ name: '「🤖」ʙᴏᴛ-ᴋᴏᴍᴜᴛ', type: ChannelType.GuildText, parent: catStatus.id });
  channels.lastRegistered = await create({
    name: '「👤」 Null',
    type: ChannelType.GuildVoice,
    parent: catStatus.id,
    permissionOverwrites: lockedStatVoiceOverwrites,
  });
  channels.memberCount = await create({
    name: `「👤」 : ${initialMemberCount}`,
    type: ChannelType.GuildVoice,
    parent: catStatus.id,
    permissionOverwrites: lockedStatVoiceOverwrites,
  });

  const catHasbey = await create({
    name: '👑 ʜᴀꜱʙᴇʏ',
    type: ChannelType.GuildCategory,
    permissionOverwrites: memberOnlyCategory,
  });
  channels.log = await create({
    name: '「💾」ʟᴏɢ-ᴋᴀʏɪᴛ',
    type: ChannelType.GuildText,
    parent: catHasbey.id,
    permissionOverwrites: ownerAdminOnly,
  });
  channels.rules = await create({
    name: '「⛔」ᴋᴜʀᴀʟʟᴀʀ',
    type: ChannelType.GuildText,
    parent: catHasbey.id,
    permissionOverwrites: restrictedTextOverwrites,
  });
  channels.ann = await create({
    name: '「📢」ᴅᴜʏᴜʀᴜʟᴀʀ',
    type: ChannelType.GuildText,
    parent: catHasbey.id,
    permissionOverwrites: restrictedTextOverwrites,
  });
  channels.clips = await create({
    name: '「📺」ʏᴀʏɪɴᴅᴀɴ-ᴋʟɪᴘʟᴇʀ',
    type: ChannelType.GuildText,
    parent: catHasbey.id,
    permissionOverwrites: restrictedTextOverwrites,
  });

  const catChat = await create({
    name: '💬 ɢᴇɴᴇʟ ᴄʜᴀᴛ',
    type: ChannelType.GuildCategory,
    permissionOverwrites: memberOnlyCategory,
  });
  await create({ name: '「💬」sᴏʜʙᴇᴛ', type: ChannelType.GuildText, parent: catChat.id });
  channels.mainBot = await create({ name: '「🤖」ʙᴏᴛ-ᴋᴏᴍᴜᴛ', type: ChannelType.GuildText, parent: catChat.id });
  await create({ name: '「🔗」ʙᴀɢʟᴀɴᴛɪ', type: ChannelType.GuildText, parent: catChat.id });
  await create({ name: '「📸」ᴠɪᴅᴇᴏ-ғᴏᴛᴏɢʀᴀғ', type: ChannelType.GuildText, parent: catChat.id });
  await create({ name: '「🎮」ᴏʏᴜɴ-ᴏɴᴇʀɪ', type: ChannelType.GuildText, parent: catChat.id });

  const catYetkili = await create({
    name: '⭐ ʏᴇᴛᴋɪʟɪ ᴏᴅᴀʟᴀʀı',
    type: ChannelType.GuildCategory,
    permissionOverwrites: memberOnlyCategory,
  });
  const staffOnlyOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: roles.admin.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    },
    {
      id: roles.mod.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    },
    {
      id: roles.trialMod.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    },
    {
      id: roles.destek.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    },
    {
      id: roles.etkinlik.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    },
  ];
  await create({
    name: '「⚒️」ᴍᴏᴅᴇʀᴀᴛᴏ̈ʀ',
    type: ChannelType.GuildVoice,
    parent: catYetkili.id,
    permissionOverwrites: staffOnlyOverwrites,
  });
  await create({
    name: '「💎」ᴠɪᴘ',
    type: ChannelType.GuildVoice,
    parent: catYetkili.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: roles.vip.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
      },
    ],
  });
  const catStream = await create({
    name: '🛰️ ꜱᴛʀᴇᴀᴍ ᴍᴏᴅᴇ',
    type: ChannelType.GuildCategory,
    permissionOverwrites: memberOnlyCategory,
  });
  const streamDeniedRoleIds = [
    roles.etkinlik.id,
    roles.developer.id,
    roles.vip.id,
    roles.botTag.id,
    roles.hanim.id,
    roles.drama.id,
    roles.member.id,
    roles.mod.id,
    roles.trialMod.id,
  ];
  const streamOverwrites = streamDeniedRoleIds.map((id) => ({
    id,
    deny: [PermissionFlagsBits.Connect],
  }));
  /** Yalnızca bağlantı redleri bırakılırsa bazı istemcilerde kategori mirası yeterli olmayabiliyor; misafir için görüntülemeyi kanalda da netleştiriyoruz. */
  const streamVoicePermissionOverwrites = mergePermissionOverwrites([
    memberOnlyCategory,
    streamOverwrites,
  ]);
  await create({
    name: '「🛰️」ʏᴀʏɪɴ ᴋᴀɴᴀʟɪ¹',
    type: ChannelType.GuildVoice,
    parent: catStream.id,
    permissionOverwrites: streamVoicePermissionOverwrites,
  });
  await create({
    name: '「🛰️」ʏᴀʏɪɴ ᴋᴀɴᴀʟɪ²',
    type: ChannelType.GuildVoice,
    parent: catStream.id,
    permissionOverwrites: streamVoicePermissionOverwrites,
  });

  const catVoice = await create({
    name: '🎙️ꜱᴇꜱ ᴋᴀɴᴀʟʟᴀʀı',
    type: ChannelType.GuildCategory,
    permissionOverwrites: memberOnlyCategory,
  });
  await create({ name: '「🎙️」sᴇsʟɪ sᴏʜʙᴇᴛ¹', type: ChannelType.GuildVoice, parent: catVoice.id });
  await create({ name: '「🎙️」sᴇsʟɪ sᴏʜʙᴇᴛ²', type: ChannelType.GuildVoice, parent: catVoice.id });
  await create({
    name: '「🧸」ʜᴀɴıᴍᴇꜰᴇɴᴅɪʟᴇʀ',
    type: ChannelType.GuildVoice,
    parent: catVoice.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: roles.hanim.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
      },
      {
        id: roles.drama.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
      },
    ],
  });
  await create({ name: '「🎵」ᴍüᴢɪᴋ', type: ChannelType.GuildVoice, parent: catVoice.id });

  const catTemp = await create({
    name: '🔐 ᴏ̈ᴢᴇʟ ᴏᴅᴀʟᴀʀ',
    type: ChannelType.GuildCategory,
    permissionOverwrites: memberOnlyCategory,
  });
  channels.lobby = await create({ name: '🗝️ ʙᴀɴᴀ ᴛɪᴋʟᴀ', type: ChannelType.GuildVoice, parent: catTemp.id });

  const catGame = await create({
    name: '🕹️ᴏʏᴜɴ ᴏᴅᴀʟᴀʀı',
    type: ChannelType.GuildCategory,
    permissionOverwrites: memberOnlyCategory,
  });
  channels.araCmd = await create({ name: 'ʙᴏᴛ-ᴋᴏᴍᴜᴛ', type: ChannelType.GuildText, parent: catGame.id });
  channels.araNotify = await create({
    name: '「🔔」ᴏʏᴜɴᴄᴜ-ʙɪʟᴅɪʀɪᴍ',
    type: ChannelType.GuildText,
    parent: catGame.id,
    permissionOverwrites: notifyReadonlyOverwrites,
  });
  await create({ name: '「🦧」ᴏᴅᴀ¹', type: ChannelType.GuildVoice, parent: catGame.id, userLimit: 5 });
  await create({ name: '「🦧」ᴏᴅᴀ²', type: ChannelType.GuildVoice, parent: catGame.id, userLimit: 5 });
  await create({ name: '「🦧」ᴏᴅᴀ³', type: ChannelType.GuildVoice, parent: catGame.id, userLimit: 5 });
  await create({ name: '「🦧」ᴏᴅᴀ⁴', type: ChannelType.GuildVoice, parent: catGame.id, userLimit: 5 });
  await create({ name: '「🦧」ᴏᴅᴀ⁵', type: ChannelType.GuildVoice, parent: catGame.id, userLimit: 5 });

  const catAfk = await create({
    name: '💤 ᴅıꜱ̧ᴀʀᴅᴀ',
    type: ChannelType.GuildCategory,
    permissionOverwrites: memberOnlyCategory,
  });
  channels.afk = await create({ name: '「🥱」ʙɪʀᴀᴢ-ᴍᴏʟᴀ', type: ChannelType.GuildVoice, parent: catAfk.id });

  if (botOwnerId) {
    const ownerMember = await guild.members.fetch(botOwnerId).catch(() => null);
    if (ownerMember) {
      await ownerMember.roles.add(roles.owner.id, 'HasBEY owner atamasi').catch(() => {});
    }
  }
  const meMember = guild.members.me || (await guild.members.fetch(guild.client.user.id).catch(() => null));
  if (meMember) {
    await meMember.roles.add(roles.botTag.id, 'HasBEY bot rolu atamasi').catch(() => {});
  }

  return {
    roles: {
      ownerRoleId: roles.owner.id,
      adminRoleId: roles.admin.id,
      modRoleId: roles.mod.id,
      trialModRoleId: roles.trialMod.id,
      supportRoleId: roles.destek.id,
      eventRoleId: roles.etkinlik.id,
      streamerRoleId: roles.streamer.id,
      developerRoleId: roles.developer.id,
      vipRoleId: roles.vip.id,
      botTagRoleId: roles.botTag.id,
      femaleRoleId: roles.hanim.id,
      dramaQueenRoleId: roles.drama.id,
      memberRoleId: roles.member.id,
      memberRoleName: roles.member.name,
      guestRoleId: roles.guest.id,
      guestRoleName: roles.guest.name,
    },
    channels: {
      guestSlashCommandsChannelId: channels.guestBot.id,
      slashCommandsChannelId: channels.mainBot.id,
      registrationLogChannelId: channels.log.id,
      streamAnnounceChannelId: channels.ann.id,
      lastRegisteredDisplayChannelId: channels.lastRegistered.id,
      memberCountChannelId: channels.memberCount.id,
      lobbyVoiceId: channels.lobby.id,
      tempCategoryId: catTemp.id,
      araCommandChannelId: channels.araCmd.id,
      araNotifyChannelId: channels.araNotify.id,
      playerCategoryId: catGame.id,
      afkVoiceId: channels.afk.id,
      rulesChannelId: channels.rules.id,
      announcementChannelId: channels.ann.id,
    },
    features: defaultFeatures(),
    timeouts: {
      afkMinutes: 30,
      guestRegisterReminderDeleteMinutes: 5,
      guestRegisterReminderStyle: 'dm_once',
    },
    customMessages: defaultCustomMessages(),
  };
}

module.exports = {
  deleteAllChannelsAndRoles,
  installDefaultTemplate,
  TEMPLATE_GUEST_ROLE_NAME,
};
