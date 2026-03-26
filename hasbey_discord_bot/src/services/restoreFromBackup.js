const { ChannelType } = require('discord.js');

const SUPPORTED_CHANNEL_TYPES = new Set([0, 2, 4, 5, 13, 15]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toDiscordChannelType(t) {
  const n = Number(t);
  if (n === 0) return ChannelType.GuildText;
  if (n === 2) return ChannelType.GuildVoice;
  if (n === 4) return ChannelType.GuildCategory;
  if (n === 5) return ChannelType.GuildAnnouncement;
  if (n === 13) return ChannelType.GuildStageVoice;
  if (n === 15) return ChannelType.GuildForum;
  return null;
}

function mapPermissionOverwrites(overwrites, guild, roleMap, oldGuildId) {
  const out = [];
  for (const ow of overwrites || []) {
    const allow = BigInt(String(ow.allow ?? '0'));
    const deny = BigInt(String(ow.deny ?? '0'));
    const oid = String(ow.id);
    const type = Number(ow.type);
    let nid = null;
    if (type === 0) {
      if (oid === oldGuildId) nid = guild.id;
      else nid = roleMap.get(oid) || null;
    } else if (type === 1) {
      nid = oid;
    }
    if (!nid) continue;
    out.push({ id: nid, type, allow, deny });
  }
  return out;
}

/**
 * sunucu-yedek.json içeriğini yeni sunucuda yeniden oluşturur (rol/kanal + izinler).
 * @returns {{ roleMap: Map<string,string>, channelMap: Map<string,string> }}
 */
async function restoreGuildFromBackup(guild, payload) {
  const oldGuildId = String(payload.guildId || '');
  const roleMap = new Map();
  const channelMap = new Map();

  const rolesSnap = [...(payload.roles || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  for (const r of rolesSnap) {
    const rid = String(r.id);
    if (r.managed) {
      const found = guild.roles.cache.find((x) => x.name === r.name);
      if (found) roleMap.set(rid, found.id);
      await sleep(80);
      continue;
    }
    let role = guild.roles.cache.find((x) => x.name === r.name && x.managed === false);
    if (!role) {
      let perms = 0n;
      try {
        perms = BigInt(String(r.permissions ?? '0'));
      } catch {
        perms = 0n;
      }
      try {
        role = await guild.roles.create({
          name: String(r.name).slice(0, 100),
          color: Number(r.color) || 0,
          hoist: Boolean(r.hoist),
          mentionable: Boolean(r.mentionable),
          permissions: perms,
          reason: 'HasBEY yedekten kurulum',
        });
      } catch (e) {
        console.error('[restore] rol oluşturulamadı:', r.name, e.message);
        await sleep(200);
        continue;
      }
      await sleep(120);
    }
    roleMap.set(rid, role.id);
  }

  const positionPairs = [];
  for (const r of rolesSnap) {
    const newId = roleMap.get(String(r.id));
    if (newId && r.position != null) positionPairs.push({ role: newId, position: r.position });
  }
  if (positionPairs.length) {
    try {
      await guild.roles.setPositions(positionPairs);
    } catch (e) {
      console.warn('[restore] rol sırası ayarlanamadı:', e.message);
    }
  }

  await guild.roles.fetch().catch(() => {});

  const rawChannels = [...(payload.channels || [])];
  rawChannels.forEach((chSort, idx) => {
    chSort._ord = typeof chSort.rawPosition === 'number' ? chSort.rawPosition : idx;
  });
  const categories = rawChannels.filter((c) => Number(c.type) === 4).sort((a, b) => a._ord - b._ord);
  const others = rawChannels.filter((c) => Number(c.type) !== 4).sort((a, b) => a._ord - b._ord);

  async function createChannel(ch) {
    const typeNum = Number(ch.type);
    const dType = toDiscordChannelType(typeNum);
    if (!dType || !SUPPORTED_CHANNEL_TYPES.has(typeNum)) return;

    const parentOld = ch.parentId ? String(ch.parentId) : null;
    const parentNew = parentOld ? channelMap.get(parentOld) : null;
    if (parentOld && !parentNew) return;

    const overwrites = mapPermissionOverwrites(ch.permissionOverwrites, guild, roleMap, oldGuildId);
    const opt = {
      name: String(ch.name).slice(0, 100),
      type: dType,
      permissionOverwrites: overwrites,
      reason: 'HasBEY yedekten kurulum',
    };
    if (parentNew) opt.parent = parentNew;

    if (typeNum === 0 || typeNum === 5 || typeNum === 15) {
      if (ch.topic) opt.topic = String(ch.topic).slice(0, 1024);
      if (ch.rateLimitPerUser != null && Number(ch.rateLimitPerUser) > 0)
        opt.rateLimitPerUser = Number(ch.rateLimitPerUser);
    }
    if (typeNum === 2 || typeNum === 13) {
      if (ch.bitrate) opt.bitrate = Number(ch.bitrate);
      if (ch.userLimit != null) opt.userLimit = Number(ch.userLimit) || undefined;
    }

    let created;
    try {
      created = await guild.channels.create(opt);
    } catch (e) {
      console.error('[restore] kanal:', ch.name, e.message);
      return;
    }
    channelMap.set(String(ch.id), created.id);
    await sleep(200);
  }

  for (const ch of categories) {
    await createChannel(ch);
  }

  let remaining = [...others];
  let guard = 0;
  while (remaining.length && guard++ < 200) {
    const round = [];
    for (const ch of remaining) {
      const pOld = ch.parentId ? String(ch.parentId) : null;
      if (pOld && !channelMap.has(pOld)) continue;
      await createChannel(ch);
      round.push(ch);
    }
    remaining = remaining.filter((c) => !round.includes(c));
    if (!round.length) break;
  }

  if (remaining.length) {
    console.warn('[restore] oluşturulamayan kanal sayısı:', remaining.length);
  }

  await guild.channels.fetch().catch(() => {});

  return { roleMap, channelMap };
}

function remapSnowflakeDeep(obj, roleMap, channelMap, oldGuildId, newGuildId) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === 'object') remapSnowflakeDeep(item, roleMap, channelMap, oldGuildId, newGuildId);
    }
    return;
  }
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string' && /^\d{10,25}$/.test(v)) {
      if (v === oldGuildId) obj[key] = newGuildId;
      else if (roleMap.has(v)) obj[key] = roleMap.get(v);
      else if (channelMap.has(v)) obj[key] = channelMap.get(v);
    } else if (v && typeof v === 'object') {
      remapSnowflakeDeep(v, roleMap, channelMap, oldGuildId, newGuildId);
    }
  }
}

function mergeConfigAfterRestore(cfg, guildId, payload, roleMap, channelMap) {
  const oldGid = String(payload.guildId || '');
  const next = {
    ...cfg,
    roles: { ...cfg.roles, ...(payload.botConfig?.roles || {}) },
    channels: { ...cfg.channels, ...(payload.botConfig?.channels || {}) },
  };
  if (payload.botConfig?.timeouts) {
    next.timeouts = { ...cfg.timeouts, ...payload.botConfig.timeouts };
  }
  if (payload.botConfig?.features) {
    next.features = { ...cfg.features, ...payload.botConfig.features };
  }
  if (payload.botConfig?.customMessages) {
    next.customMessages = { ...cfg.customMessages, ...payload.botConfig.customMessages };
  }

  remapSnowflakeDeep(next.roles, roleMap, channelMap, oldGid, guildId);
  remapSnowflakeDeep(next.channels, roleMap, channelMap, oldGid, guildId);
  if (next.customMessages) remapSnowflakeDeep(next.customMessages, roleMap, channelMap, oldGid, guildId);

  return next;
}

module.exports = {
  restoreGuildFromBackup,
  mergeConfigAfterRestore,
};
