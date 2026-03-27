const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig, writeGuildConfig } = require('../lib/storage');
const { installDefaultTemplate } = require('../services/defaultTemplate');
const { meHas, NEED_MANAGE } = require('../lib/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('Bot sahipliğini alır; bundan sonra diğer komutlar çalışır')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.editReply({ content: 'Bu komut sadece sunucuda kullanılabilir.', flags: EPHEMERAL });
      return;
    }

    const cfg = readGuildConfig(interaction.guild.id);

    if (cfg.setupComplete) {
      await interaction.editReply({
        content:
          '⚠️ **Üzgünüm, Zaten Bir Sahibim Var.**\n' +
          `Bu Sunucuda Kurulum Yapılmış; **BOT Sahibi:** <@${cfg.botOwnerId}>`,
        flags: EPHEMERAL,
      });
      return;
    }

    const next = {
      ...cfg,
      setupComplete: true,
      botOwnerId: interaction.user.id,
      createdAt: cfg.createdAt || new Date().toISOString(),
    };

    writeGuildConfig(interaction.guild.id, next);

    let templateMsg = 'Varsayilan sablon uygulanmadi.';
    if (!meHas(interaction.guild, NEED_MANAGE)) {
      templateMsg =
        'Sablon kurulumu atlandi: botta **Kanallari Yonet + Rolleri Yonet** yetkisi olmali. ' +
        'Botu Yonetici izniyle tekrar davet edin ve bot rolunu ustte tutun, sonra `/kur` calistirin.';
    } else {
      try {
        const applied = await installDefaultTemplate(interaction.guild, interaction.user.id);
        writeGuildConfig(interaction.guild.id, { ...next, ...applied });
        templateMsg = 'Varsayilan rol/kanal/izin sablonu otomatik kuruldu.';
      } catch (e) {
        templateMsg =
          `Sablon kurulumu hatasi: ${e.message}. ` +
          'Bot rolunu hedef rollerin ustune tasiyin ve gerekli izinleri verin, sonra `/kur` calistirin.';
      }
    }

    await interaction.editReply({
      content:
        '🎉 **Kurulum Tamamlandı.**\n' +
        `<@${interaction.user.id}> artık botun yöneticisi sensin.\n${templateMsg}`,
      flags: EPHEMERAL,
    });

    const ch = interaction.channel;
    if (ch?.deletable) {
      setTimeout(() => {
        ch.delete('/start kurulum kanali temizleme').catch(() => {});
      }, 1200);
    }
  },
};
