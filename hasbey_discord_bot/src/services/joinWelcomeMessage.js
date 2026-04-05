const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');
const { resolveWelcomeChannelId } = require('../lib/resolveChannels');
const { createWelcomeCard } = require('./welcomeCard');

function parseHexColor(input, fallback = 0xfee75c) {
  const raw = String(input || '')
    .trim()
    .replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return fallback;
  return parseInt(raw, 16);
}

/**
 * Misafir bot komut kanalına embed + Kayıt Ol butonu (guildMemberAdd ve /kur sonrası toplu).
 */
async function sendJoinWelcomeMessage(member, cfg) {
  if (cfg.features?.welcomeOnJoin === false) return;
  const welcomeChId = resolveWelcomeChannelId(cfg);
  if (!welcomeChId) return;

  let ch = member.guild.channels.cache.get(welcomeChId);
  if (!ch) {
    ch = await member.guild.channels.fetch(welcomeChId).catch(() => null);
  }
  if (!ch?.isTextBased()) {
    console.warn(
      `[joinWelcome] kanal yok veya metin değil: ${welcomeChId} (${member.guild.name})`
    );
    return;
  }

  const lines = cfg.customMessages?.welcomeLines;
  const defaultDesc =
    'Hoş geldin! Şu an **misafir** olarak **Sunucu durumu** bölümündeki kanalları görebilirsin (gelen-var kanalına yazı yazılamaz; sistem giriş/çıkış mesajları oraya düşer).\n\n' +
    '**Kayıt:** Aşağıdaki **Kayıt Ol** butonuna tıkla — **teşkilat** rolünü alırsın, misafir rolün kalkar; ek form yok. Diğer kanallar açılır.\n\n' +
    'Komut listesi için (izin verilen kanallarda): `/komutlar`';
  let description = defaultDesc;
  if (Array.isArray(lines) && lines.length > 0) {
    const sub = (s) =>
      String(s)
        .replaceAll('{member}', String(member))
        .replaceAll('{username}', member.user.username)
        .replaceAll('{tag}', member.user.tag);
    description = lines.map(sub).join('\n');
  }

  const card = cfg.customMessages?.welcomeCard || {};
  const imageUrl = String(card.imageUrl || '').trim();
  const embed = new EmbedBuilder()
    .setTitle(String(card.title || '👋 Hoş geldin').slice(0, 120))
    .setDescription(description)
    .setColor(parseHexColor(card.color))
    .setTimestamp(new Date());
  const files = [];
  try {
    const cardBuffer = await createWelcomeCard(member, cfg);
    const imageFile = new AttachmentBuilder(cardBuffer, { name: 'welcome-card.png' });
    files.push(imageFile);
    embed.setImage('attachment://welcome-card.png');
  } catch {
    if (imageUrl) embed.setImage(imageUrl);
  }

  await ch
    .send({
      content: `${member}`,
      embeds: [embed],
      files,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('hby:kaydol_open').setLabel('Kayıt Ol').setStyle(ButtonStyle.Primary)
        ),
      ],
    })
    .catch(() => {});
}

module.exports = { sendJoinWelcomeMessage, parseHexColor };
