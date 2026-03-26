const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  readGuildConfig,
  writeGuildConfig,
  hasGuildTemplateBackup,
  loadGuildTemplateBackup,
} = require('../lib/storage');
const { meHas, NEED_MANAGE } = require('../lib/permissions');
const { isGuildSetup, canOperateServer, isGuildBareForKur } = require('../lib/guards');
const { ensureBotData } = require('../services/tempVoice');
const { restoreGuildFromBackup, mergeConfigAfterRestore } = require('../services/restoreFromBackup');
const { EPHEMERAL } = require('../lib/discordFlags');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kur')
    .setDescription('Yedek JSON ile boş sunucuda kanal, rol ve izinleri kurar (data/backups veya import).'),

  async execute(interaction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.editReply({ content: 'Bu komut sadece sunucuda kullanılabilir.', flags: EPHEMERAL });
      return;
    }

    const gid = interaction.guild.id;
    const cfg = readGuildConfig(gid);
    if (!isGuildSetup(cfg)) {
      await interaction.editReply({ content: 'Önce `/start` çalıştırın.', flags: EPHEMERAL });
      return;
    }
    if (!canOperateServer(interaction.member, cfg)) {
      await interaction.editReply({ content: 'Bu komutu kullanma izniniz yok.', flags: EPHEMERAL });
      return;
    }
    if (!meHas(interaction.guild, NEED_MANAGE)) {
      await interaction.editReply({
        content: 'Botta **Kanalları Yönet** + **Rolleri Yönet** yetkisi olmalı.',
        flags: EPHEMERAL,
      });
      return;
    }

    if (cfg.channels?.lobbyVoiceId) {
      await interaction.editReply({
        content:
          'Bu sunucuda HasBEY **zaten yapılandırılmış** görünüyor (`lobbyVoiceId` dolu). `/kur` yalnızca boş veya çok sade sunucular içindir.',
        flags: EPHEMERAL,
      });
      return;
    }

    if (!hasGuildTemplateBackup(gid)) {
      await interaction.editReply({
        content:
          '⚠️ **Geçerli yedek yok.**\n' +
          '• Kaynak sunucuda `/yedekle` ile `sunucu-yedek.json` oluşturun.\n' +
          `• Hedef sunucuda: \`data/backups/${gid}/sunucu-yedek.json\` **veya** \`data/backups/import/sunucu-yedek.json\` olarak koyun.\n` +
          'Ardından yeniden `/kur`.',
        flags: EPHEMERAL,
      });
      return;
    }

    if (!isGuildBareForKur(interaction.guild)) {
      await interaction.editReply({
        content:
          'Bu sunucuda çok fazla kanal/rol var; `/kur` **yalnızca boş / minimal** yapıda kullanılır.\n' +
          "Gereksizleri silin veya yeni sunucuda deneyin. (İpucu: 'KAYIT' kategorisi varsa da kurulmaz.)",
        flags: EPHEMERAL,
      });
      return;
    }

    await interaction.editReply({
      content:
        '**Onay** — Yedekten **roller + kanallar + izin overwrite** kopyalanacak; `botConfig` içindeki ID’ler yeni sunucuya eşlenecek.\n' +
        'Devam edilsin mi?',
      flags: EPHEMERAL,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('hby:confirm:kur').setLabel('Evet, kur').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('hby:cancel:kur').setLabel('Hayır').setStyle(ButtonStyle.Secondary)
        ),
      ],
    });

    ensureBotData(interaction.client).pendingConfirm.set(`${gid}:${interaction.user.id}`, {
      type: 'kur',
      expires: Date.now() + 120_000,
    });
  },
};

module.exports.runKur = async (interaction) => {
  const gid = interaction.guild.id;
  if (!hasGuildTemplateBackup(gid) || !isGuildBareForKur(interaction.guild)) {
    await interaction.followUp({
      content:
        '/kur artık geçersiz: yedek yok veya sunucu artık “sade” değil. Sayfayı yenileyip komutları tekrar deneyin.',
      flags: EPHEMERAL,
    });
    return;
  }
  const payload = loadGuildTemplateBackup(gid);
  if (!payload) {
    await interaction.followUp({ content: 'Yedek dosyası okunamadı.', flags: EPHEMERAL });
    return;
  }

  const { roleMap, channelMap } = await restoreGuildFromBackup(interaction.guild, payload);
  const cfg = readGuildConfig(gid);
  const next = mergeConfigAfterRestore(cfg, gid, payload, roleMap, channelMap);
  writeGuildConfig(gid, next);

  await interaction.followUp({
    content:
      '✅ **Yedekten kurulum bitti.** Roller, kategoriler ve kanallar oluşturuldu; izinler kopyalandı. `botConfig` kanal/rol ID’leri güncellendi.\n' +
      'Özet: `/komutlar` — Eksik eşleşme varsa `data/guilds` içindeki ID’leri menüden düzelt.\n' +
      '**Not:** Üye bazlı izinler aynı kullanıcı ID’siyle çalışır; entegrasyon rolleri yalnız aynı isimle eşlenir.',
    flags: EPHEMERAL,
  });
};

