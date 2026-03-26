const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig, writeGuildConfig } = require('../lib/storage');

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

    await interaction.editReply({
      content:
        '🎉 **Kurulum Tamamlandı.**\n' +
        `<@${interaction.user.id}> artık botun yöneticisi sensin.`,
      flags: EPHEMERAL,
    });
  },
};
