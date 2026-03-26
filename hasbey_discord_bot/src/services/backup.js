/**
 * Sunucu yapısı dışa aktarımı (kanal/rol izinleri). Mesaj içeriği dahil değildir.
 */
async function exportGuildSnapshot(guild) {
  const roles = guild.roles.cache
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      mentionable: r.mentionable,
      managed: Boolean(r.managed),
      permissions: r.permissions.bitfield.toString(),
      position: r.position,
    }));

  const channels = guild.channels.cache
    .sort((a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id))
    .map((ch) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      parentId: ch.parentId,
      topic: ch.topic,
      bitrate: ch.bitrate ?? null,
      userLimit: ch.userLimit ?? null,
      rateLimitPerUser: ch.rateLimitPerUser ?? null,
      rawPosition: typeof ch.rawPosition === 'number' ? ch.rawPosition : 0,
      permissionOverwrites: ch.permissionOverwrites.cache.map((o) => ({
        id: o.id,
        type: o.type,
        allow: o.allow.bitfield.toString(),
        deny: o.deny.bitfield.toString(),
      })),
    }));

  return {
    exportedAt: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    roles,
    channels,
  };
}

module.exports = { exportGuildSnapshot };
