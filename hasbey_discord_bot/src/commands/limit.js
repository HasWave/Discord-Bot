const { SlashCommandBuilder } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup, canOperateServer } = require('../lib/guards');
const { getTempMeta } = require('../services/tempVoice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('limit')
    .setDescription('Geçici odanın kullanıcı sınırını güncelle (5-10)')
    .addIntegerOption((o) =>
      o.setName('sayi').setDescription('Kullanıcı sınırı (5-10)').setRequired(true).setMinValue(5).setMaxValue(10)
    ),

  async execute(interaction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.editReply({ content: 'Bu komut sadece sunucuda kullanılabilir.', flags: EPHEMERAL });
      return;
    }

    const cfg = readGuildConfig(interaction.guild.id);
    if (!isGuildSetup(cfg)) {
      await interaction.editReply({ content: 'Bot henüz kurulmadı.', flags: EPHEMERAL });
      return;
    }

    const vc = interaction.member.voice?.channel;
    if (!vc || !vc.isVoiceBased()) {
      await interaction.editReply({ content: 'Bir geçici ses odasında olmalısın.', flags: EPHEMERAL });
      return;
    }

    const meta = getTempMeta(interaction.client, vc.id);
    if (!meta) {
      await interaction.editReply({ content: 'Bu komut yalnızca geçici odalarda çalışır.', flags: EPHEMERAL });
      return;
    }

    const privileged = canOperateServer(interaction.member, cfg);
    if (!privileged && meta.ownerId !== interaction.user.id) {
      await interaction.editReply({ content: 'Bu odayı yalnızca oda sahibi veya yetkililer yönetir.', flags: EPHEMERAL });
      return;
    }

    const limit = interaction.options.getInteger('sayi', true);
    try {
      await vc.setUserLimit(limit, `Geçici oda limiti: ${interaction.user.tag}`);
    } catch {
      await interaction.editReply({ content: 'Oda limiti güncellenemedi (yetki/hiyerarşi).', flags: EPHEMERAL });
      return;
    }

    await interaction.editReply({ content: `✅ Oda limiti **${limit}** olarak güncellendi.`, flags: EPHEMERAL });
  },
};
