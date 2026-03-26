const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig, writeBackup } = require('../lib/storage');
const { exportGuildSnapshot } = require('../services/backup');
const { isGuildSetup, canOperateServer } = require('../lib/guards');
const { ensureBotData } = require('../services/tempVoice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('yedekle')
    .setDescription('Sunucu roller/kanallar/izinleri JSON olarak dışa aktarır (onay ister)'),

  async execute(interaction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.editReply({ content: 'Bu komut sadece sunucuda kullanılabilir.', flags: EPHEMERAL });
      return;
    }

    const cfg = readGuildConfig(interaction.guild.id);
    if (!isGuildSetup(cfg)) {
      await interaction.editReply({ content: 'Önce `/start` çalıştırın.', flags: EPHEMERAL });
      return;
    }
    if (!canOperateServer(interaction.member, cfg)) {
      await interaction.editReply({ content: 'Bu komutu kullanma izniniz yok.', flags: EPHEMERAL });
      return;
    }

    await interaction.editReply({
      content:
        '⚠️ Emin Misiniz ?\n' +
        'Kanallar ve Rolleri Yedeklemeye Onay Veriyor Musunuz ?',
      flags: EPHEMERAL,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('hby:confirm:yedekle').setLabel('Evet').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('hby:cancel:yedekle').setLabel('Hayır').setStyle(ButtonStyle.Secondary)
        ),
      ],
    });

    ensureBotData(interaction.client).pendingConfirm.set(`${interaction.guild.id}:${interaction.user.id}`, {
      type: 'yedekle',
      expires: Date.now() + 120_000,
    });
  },
};

module.exports.runYedekle = async (interaction) => {
  const snap = await exportGuildSnapshot(interaction.guild);
  const botConfig = readGuildConfig(interaction.guild.id);
  const payload = { ...snap, botConfig };
  writeBackup(interaction.guild.id, 'sunucu-yedek', payload);
  await interaction.followUp({
    content: '💾 Yedekleme Başarılı.',
    flags: EPHEMERAL,
  });
};
