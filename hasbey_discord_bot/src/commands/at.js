const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup, canOperateServer } = require('../lib/guards');
const { getTempMeta } = require('../services/tempVoice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('at')
    .setDescription('Geçici odanda bir üyeyi sesten at')
    .addUserOption((o) =>
      o.setName('uye').setDescription('Atılacak kullanıcı').setRequired(true)
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

    const target = interaction.options.getMember('uye');
    if (!target) {
      await interaction.editReply({ content: 'Kullanıcı bulunamadı.', flags: EPHEMERAL });
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.editReply({ content: 'Kendini atamazsın.', flags: EPHEMERAL });
      return;
    }

    if (target.voice?.channelId !== vc.id) {
      await interaction.editReply({ content: 'Bu kullanıcı aynı odada değil.', flags: EPHEMERAL });
      return;
    }

    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.MoveMembers)) {
      await interaction.editReply({ content: 'Botta **Üyeleri Taşı** yetkisi yok.', flags: EPHEMERAL });
      return;
    }

    try {
      await target.voice.disconnect('Geçici odadan atıldı');
    } catch {
      await interaction.editReply({ content: 'Kullanıcı atılamadı (yetki veya durum).', flags: EPHEMERAL });
      return;
    }

    await interaction.editReply({ content: `${target} sesten atıldı.`, flags: EPHEMERAL });
  },
};
