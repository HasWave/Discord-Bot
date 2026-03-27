const { SlashCommandBuilder } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup, canOperateServer } = require('../lib/guards');
const { getTempMeta, setTempChannelOwner } = require('../services/tempVoice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('devret')
    .setDescription('Geçici odanın sahipliğini bir üyeye devret')
    .addUserOption((o) => o.setName('uye').setDescription('Yeni oda sahibi').setRequired(true)),

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
    if (target.user.bot) {
      await interaction.editReply({ content: 'Botlara sahiplik devredilemez.', flags: EPHEMERAL });
      return;
    }
    if (target.voice?.channelId !== vc.id) {
      await interaction.editReply({ content: 'Sahiplik yalnızca aynı odadaki birine devredilebilir.', flags: EPHEMERAL });
      return;
    }
    if (target.id === meta.ownerId) {
      await interaction.editReply({ content: 'Bu kullanıcı zaten oda sahibi.', flags: EPHEMERAL });
      return;
    }

    try {
      await setTempChannelOwner(vc, meta.ownerId, target.id);
      meta.ownerId = target.id;
    } catch {
      await interaction.editReply({ content: 'Sahiplik devri başarısız oldu (yetki/hiyerarşi).', flags: EPHEMERAL });
      return;
    }

    await interaction.editReply({ content: `✅ Oda sahipliği ${target} kişisine devredildi.`, flags: EPHEMERAL });
  },
};
