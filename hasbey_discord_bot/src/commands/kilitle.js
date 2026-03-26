const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup, canOperateServer } = require('../lib/guards');
const { resolveMemberRoleId } = require('../lib/resolveRoles');
const { getTempMeta, setLocked } = require('../services/tempVoice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kilitle')
    .setDescription('Geçici ses odanda kilidi aç/kapat (Kayıtlı rolü bağlanamasın)'),

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
      await interaction.editReply({ content: 'Önce geçici odanın olduğu ses kanalında olmalısın.', flags: EPHEMERAL });
      return;
    }

    const meta = getTempMeta(interaction.client, vc.id);
    if (!meta) {
      await interaction.editReply({ content: 'Bu komut yalnızca botun oluşturduğu geçici odalarda çalışır.', flags: EPHEMERAL });
      return;
    }

    const privileged = canOperateServer(interaction.member, cfg);
    if (!privileged && meta.ownerId !== interaction.user.id) {
      await interaction.editReply({ content: 'Bu odayı yalnızca oda sahibi veya yetkililer kilitleyebilir.', flags: EPHEMERAL });
      return;
    }

    const memberRoleId = resolveMemberRoleId(interaction.guild, cfg);
    if (!memberRoleId) {
      await interaction.editReply({
        content: 'Kayıtlı rolü çözülemedi; kilitleme için rol ID veya sunucuda eşleşen rol adı gerekir.',
        flags: EPHEMERAL,
      });
      return;
    }

    meta.locked = !meta.locked;
    await setLocked(vc, memberRoleId, meta.locked);

    await interaction.editReply({
      content: meta.locked ? 'Oda kilitlendi (Kayıtlı rolü bağlanamaz).' : 'Oda kilidi kaldırıldı.',
      flags: EPHEMERAL,
    });
  },
};
