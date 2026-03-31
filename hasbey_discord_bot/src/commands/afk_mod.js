const { SlashCommandBuilder } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig, writeGuildConfig } = require('../lib/storage');
const { isGuildSetup } = require('../lib/guards');
const { ensureBotData } = require('../services/tempVoice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk_mod')
    .setDescription('AFK taşıma eklentisini aç veya kapat (yalnızca bot sahibi)')
    .addStringOption((o) =>
      o
        .setName('durum')
        .setDescription('on = açık, off = kapalı')
        .setRequired(true)
        .addChoices(
          { name: 'on — açık', value: 'on' },
          { name: 'off — kapalı', value: 'off' }
        )
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

    const ownerId = cfg.botOwnerId ? String(cfg.botOwnerId).trim() : '';
    if (!ownerId || interaction.user.id !== ownerId) {
      await interaction.editReply({ content: 'Bu komutu yalnızca **bot sahibi** kullanabilir.', flags: EPHEMERAL });
      return;
    }

    const raw = interaction.options.getString('durum', true);
    const on = raw === 'on';
    const next = {
      ...cfg,
      features: { ...cfg.features, afkMover: on },
    };
    writeGuildConfig(interaction.guild.id, next);

    if (!on) {
      const bd = ensureBotData(interaction.client);
      const prefix = `${interaction.guild.id}:`;
      for (const k of [...bd.voiceJoinedAt.keys()]) {
        if (k.startsWith(prefix)) bd.voiceJoinedAt.delete(k);
      }
    }

    await interaction.editReply({
      content: on
        ? '🤖 Afk Taşıma Eklentisi Açıldı.'
        : '🤖 Afk Taşıma Eklentisi Kapatıldı.',
      flags: EPHEMERAL,
    });
  },
};
