const { SlashCommandBuilder } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig } = require('../lib/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('komutlar')
    .setDescription('Slash komutlarının kullanılacağı kanalı gösterir'),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.editReply({ content: 'Bu komut yalnızca sunucuda kullanılabilir.', flags: EPHEMERAL });
      return;
    }

    const cfg = readGuildConfig(interaction.guild.id);
    const slashChId = cfg.channels?.slashCommandsChannelId ? String(cfg.channels.slashCommandsChannelId).trim() : '';
    const guestChId = cfg.channels?.guestSlashCommandsChannelId
      ? String(cfg.channels.guestSlashCommandsChannelId).trim()
      : '';
    const slashGuestSame = guestChId && guestChId === slashChId;

    if (!slashChId && !guestChId) {
      await interaction.editReply({
        content:
          '⚠️ **Slash komut kanalı** ayarlı değil (`slashCommandsChannelId`) — **Kanalları Ayarla**.',
        flags: EPHEMERAL,
      });
      return;
    }

    const ch = interaction.channelId ? String(interaction.channelId).trim() : '';
    const hereSlash = slashChId && ch === slashChId;
    const hereGuest = guestChId && !slashGuestSame && ch === guestChId;
    const here = hereSlash || hereGuest;

    const mentionMain = slashChId ? `<#${slashChId}>` : '';
    /** Misafir kanalı menüde kalır; duyuruda yalnızca kayıtlı slash kanalı gösterilir */
    const mentionFallback = !slashChId && guestChId ? `<#${guestChId}>` : '';

    let main;
    if (here) {
      main =
        'Şu an slash komutları için **doğru kanaldasınız**. Çoğu komutu burada kullanabilirsiniz.';
    } else {
      if (mentionMain) {
        main = `Slash komutları (çoğu) şu kanalda kullanılabilir: ${mentionMain}. Lütfen o kanala geçin.`;
      } else if (mentionFallback) {
        main = `Slash komutları (çoğu) şu kanalda kullanılabilir: ${mentionFallback}. Lütfen o kanala geçin.`;
      } else {
        main = 'Komut kanalı yapılandırması eksik.';
      }
    }

    const araRaw = cfg.channels?.araCommandChannelId;
    const araId = araRaw ? String(araRaw).trim() : '';

    let araBlock = '';
    if (araId) {
      const araHere = araId === ch;
      const araWithMain = araId === slashChId;
      const araWithGuest = guestChId && araId === guestChId;
      if (araHere || araWithMain || araWithGuest) {
        araBlock = `\n\n📢 **Takım araması** bu kanaldan: menüde tanımlı \`!\` kısayolları + \`!teams\` ile liste. Önce **OYUN** kategorisinde ses kanalına girin.`;
      } else {
        araBlock = `\n\n🔔 **Takım araması** yalnızca <#${araId}> — kısayollar menüden eklenir; \`!teams\` ile oyunları listelersin (OYUN kategorisinde ses kanalındayken).`;
      }
    }

    await interaction.editReply({ content: main + araBlock, flags: EPHEMERAL });
  },
};
