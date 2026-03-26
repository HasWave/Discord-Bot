const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup } = require('../lib/guards');
const {
  postTeamSearchAnnouncement,
  LFG_HINT_TEAMS,
  formatLfgUserReply,
} = require('../services/teamSearchAnnounce');

const replyCooldownMs = 2500;
const lastReply = new Map();

function cooldownKey(message, suffix = '') {
  return `${message.guild.id}:${message.channel.id}:${message.author.id}${suffix}`;
}

function substituteResponse(template, message) {
  return String(template)
    .replaceAll('{mention}', `<@${message.author.id}>`)
    .replaceAll('{username}', message.author.username)
    .replaceAll('{tag}', message.author.tag);
}

module.exports = async function onMessageCreate(message) {
  if (!message.guild || message.author.bot) return;
  if (!message.content || typeof message.content !== 'string') return;

  const cfg = readGuildConfig(message.guild.id);
  const trimmed = message.content.trim();
  if (!trimmed) return;

  const araCmdId = cfg.channels?.araCommandChannelId ? String(cfg.channels.araCommandChannelId).trim() : '';
  if (araCmdId && message.channel.id === araCmdId && isGuildSetup(cfg)) {
    const low = trimmed.toLowerCase();
    const shortcuts = Array.isArray(cfg.customMessages?.lfgShortcuts) ? cfg.customMessages.lfgShortcuts : [];

    if (low === '!teams') {
      const key = cooldownKey(message, ':lfgteams');
      const now = Date.now();
      if (lastReply.get(key) && now - lastReply.get(key) < replyCooldownMs) return;
      lastReply.set(key, now);
      try {
        if (!shortcuts.length) {
          await message.reply({
            content:
              'Henüz kısayol yok. Terminal menüsü → **Discord Ayarları → Eklentiler → Ekip arama kısayolları** ile `!örnek` ve oyun adı ekleyin.',
            allowedMentions: { users: [message.author.id] },
          });
        } else {
          const lines = shortcuts.map((s) => `• \`${s.trigger}\` → **${s.game}**`);
          await message.reply({
            content: `**Oyuncu arama kısayolları:**\n${lines.join('\n')}\n\n_OYUN kategorisinde ses kanalındayken gönderin._`,
            allowedMentions: { users: [message.author.id] },
          });
        }
      } catch {
        /* yetki */
      }
      return;
    }

    const rule = shortcuts.find((s) => s.trigger === low);
    if (rule) {
      const key = cooldownKey(message, ':lfgshort');
      const now = Date.now();
      if (lastReply.get(key) && now - lastReply.get(key) < replyCooldownMs) return;

      const playerCat = cfg.channels?.playerCategoryId ? String(cfg.channels.playerCategoryId).trim() : '';
      if (!playerCat) {
        lastReply.set(key, now);
        try {
          await message.reply({
            content:
              '**OYUN kategorisi** menüde tanımlı değil. Kanalları Ayarla → `playerCategoryId` girin.',
            allowedMentions: { users: [message.author.id] },
          });
        } catch {
          /* yetki */
        }
        return;
      }

      let member = message.member;
      if (!member) {
        try {
          member = await message.guild.members.fetch(message.author.id);
        } catch {
          return;
        }
      }

      const oyun = rule.game;
      const rank = 'Unranked';
      const mesaj = 'Ekip arkadaşı arıyorum.';

      const result = await postTeamSearchAnnouncement({
        guild: message.guild,
        cfg,
        member,
        oyun,
        rank,
        mesaj,
        aranan: '1',
      });

      lastReply.set(key, now);

      if (!result.ok) {
        try {
          if (result.reason === 'voice') {
            await message.reply({
              content: `Önce **OYUN** kategorisinde bir ses kanalına girin.\n${LFG_HINT_TEAMS}`,
              allowedMentions: { users: [message.author.id] },
            });
          } else {
            await message.reply({
              content:
                'Duyuru kanalı ayarlı değil (menüde **Oyuncu Arama Bildirim Kanalı**).',
              allowedMentions: { users: [message.author.id] },
            });
          }
        } catch {
          /* yetki */
        }
        return;
      }

      try {
        await message.reply({
          content: formatLfgUserReply(result.target),
          allowedMentions: { users: [message.author.id] },
        });
      } catch {
        /* yetki */
      }
      return;
    }
  }

  /* Tetik kuralları menüden yazılır; /start beklemeden çalışmalı (kurulum yalnızca slash ile). */
  if (cfg.features?.triggerReplies === false) return;

  const rules = cfg.customMessages?.triggerReplies;
  if (!Array.isArray(rules) || rules.length === 0) return;

  const lower = trimmed.toLowerCase();

  const key = cooldownKey(message);
  const now = Date.now();
  if (lastReply.get(key) && now - lastReply.get(key) < replyCooldownMs) return;

  for (const rule of rules) {
    const t = String(rule.trigger ?? '')
      .trim()
      .toLowerCase();
    if (!t) continue;
    if (lower !== t) continue;

    const raw = String(rule.response ?? '').trim();
    if (!raw) return;

    const text = substituteResponse(raw, message);
    lastReply.set(key, now);
    try {
      await message.reply({ content: text.slice(0, 2000), allowedMentions: { users: [message.author.id] } });
    } catch {
      /* yetki / kilit */
    }
    return;
  }
};
