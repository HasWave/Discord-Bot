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
  const normalizedCmdLike = trimmed.toLowerCase().replace(/\s+/g, '');

  if (['/k', '/ka', '/kay', '/kayd', '/kayd0l', '/kuru'].includes(normalizedCmdLike)) {
    const key = cooldownKey(message, ':didyoumean');
    const now = Date.now();
    if (!lastReply.get(key) || now - lastReply.get(key) >= replyCooldownMs) {
      lastReply.set(key, now);
      await message
        .reply({
          content: '`/kur` mu demek istedin? Kayıt için de `/kaydol` kullanabilirsin.',
          allowedMentions: { users: [message.author.id] },
        })
        .catch(() => {});
    }
    return;
  }

  if (cfg.features?.wordFilter !== false) {
    const badWords = Array.isArray(cfg.customMessages?.badWords) ? cfg.customMessages.badWords : [];
    if (badWords.length) {
      const lowerText = trimmed.toLowerCase();
      const matched = badWords.find((w) => w && lowerText.includes(String(w).toLowerCase()));
      if (matched) {
        const key = cooldownKey(message, ':badword');
        const now = Date.now();
        if (message.deletable) {
          await message.delete().catch(() => {});
        }
        if (!lastReply.get(key) || now - lastReply.get(key) >= replyCooldownMs) {
          lastReply.set(key, now);
          await message.channel
            .send({
              content: `${message.author}, uygunsuz kelime nedeniyle mesajın kaldırıldı.`,
              allowedMentions: { users: [message.author.id] },
            })
            .catch(() => {});
        }
        return;
      }
    }
  }

  const araCmdId = cfg.channels?.araCommandChannelId ? String(cfg.channels.araCommandChannelId).trim() : '';
  const low = trimmed.toLowerCase();
  const shortcuts = Array.isArray(cfg.customMessages?.lfgShortcuts) ? cfg.customMessages.lfgShortcuts : [];
  const isLfgMessage = low === '!teams' || shortcuts.some((s) => s.trigger === low);

  if (araCmdId && isGuildSetup(cfg) && isLfgMessage && message.channel.id !== araCmdId) {
    const key = cooldownKey(message, ':lfgwrongch');
    const now = Date.now();
    if (!lastReply.get(key) || now - lastReply.get(key) >= replyCooldownMs) {
      lastReply.set(key, now);
      await message
        .reply({
          content: `🔔 Bu komutu yalnızca <#${araCmdId}> kanalında kullanabilirsiniz.`,
          allowedMentions: { users: [message.author.id] },
        })
        .catch(() => {});
    }
    return;
  }

  if (araCmdId && message.channel.id === araCmdId && isGuildSetup(cfg)) {

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
