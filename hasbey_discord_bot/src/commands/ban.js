const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup, canModerateMember } = require('../lib/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Üyeyi sunucudan kalıcı olarak yasakla')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('kullanici').setDescription('Yasaklanacak kullanıcı').setRequired(true))
    .addStringOption((o) => o.setName('sebep').setDescription('Sebep (isteğe bağlı)').setMaxLength(512))
    .addIntegerOption((o) =>
      o
        .setName('mesaj_sil_saniye')
        .setDescription('Son X saniyelik mesajları sil (0=kapalı, en fazla 604800 ≈ 7 gün)')
        .setMinValue(0)
        .setMaxValue(604800)
    ),

  async execute(interaction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.editReply({ content: 'Bu komut yalnızca sunucuda kullanılabilir.', flags: EPHEMERAL });
      return;
    }

    const cfg = readGuildConfig(interaction.guild.id);
    if (!isGuildSetup(cfg)) {
      await interaction.editReply({ content: 'Bot henüz kurulmadı.', flags: EPHEMERAL });
      return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction.editReply({ content: '**Üyeleri Yasakla** yetkin yok.', flags: EPHEMERAL });
      return;
    }

    const targetUser = interaction.options.getUser('kullanici', true);
    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({ content: 'Kendini yasaklayamazsın.', flags: EPHEMERAL });
      return;
    }
    if (targetUser.id === interaction.client.user.id) {
      await interaction.editReply({ content: 'Bot yasaklanamaz.', flags: EPHEMERAL });
      return;
    }

    const guild = interaction.guild;
    if (targetUser.id === guild.ownerId) {
      await interaction.editReply({ content: 'Sunucu sahibi yasaklanamaz.', flags: EPHEMERAL });
      return;
    }

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!canModerateMember(interaction.member, targetMember, guild)) {
      await interaction.editReply({
        content: 'Bu kullanıcıyı rol hiyerarşisi nedeniyle yasaklayamazsın.',
        flags: EPHEMERAL,
      });
      return;
    }

    const reasonRaw = interaction.options.getString('sebep');
    const reason = reasonRaw?.trim() ? reasonRaw.trim().slice(0, 500) : 'Komut ile yasaklama';
    const delSec = interaction.options.getInteger('mesaj_sil_saniye');
    const banOpts = { reason: `${reason} — ${interaction.user.tag}` };
    if (delSec != null && delSec > 0) banOpts.deleteMessageSeconds = delSec;

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction.editReply({ content: 'Botta **Üyeleri Yasakla** yetkisi yok.', flags: EPHEMERAL });
      return;
    }

    try {
      await guild.members.ban(targetUser, banOpts);
    } catch (e) {
      await interaction.editReply({
        content: `Yasaklama başarısız: ${e.message || 'bilinmeyen hata'}`,
        flags: EPHEMERAL,
      });
      return;
    }

    await interaction.editReply({ content: `**${targetUser.tag}** sunucudan yasaklandı.`, flags: EPHEMERAL });
  },
};
