const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup, canModerateMember } = require('../lib/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Üyeyi sunucudan at (hesap kalır, tekrar davet ile girebilir)')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('kullanici').setDescription('Atılacak üye').setRequired(true))
    .addStringOption((o) => o.setName('sebep').setDescription('Sebep (isteğe bağlı)').setMaxLength(512)),

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

    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      await interaction.editReply({ content: '**Üyeleri At** yetkin yok.', flags: EPHEMERAL });
      return;
    }

    const target = interaction.options.getMember('kullanici');
    if (!target) {
      await interaction.editReply({ content: 'Kullanıcı sunucuda bulunamadı.', flags: EPHEMERAL });
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.editReply({ content: 'Kendini atamazsın.', flags: EPHEMERAL });
      return;
    }
    if (target.id === interaction.client.user.id) {
      await interaction.editReply({ content: 'Bot atılamaz.', flags: EPHEMERAL });
      return;
    }

    const guild = interaction.guild;
    if (!canModerateMember(interaction.member, target, guild)) {
      await interaction.editReply({
        content: 'Bu kullanıcıyı rol hiyerarşisi nedeniyle atamazsın.',
        flags: EPHEMERAL,
      });
      return;
    }

    const reasonRaw = interaction.options.getString('sebep');
    const reason = reasonRaw?.trim() ? reasonRaw.trim().slice(0, 500) : 'Komut ile atıldı';
    const kickReason = `${reason} — ${interaction.user.tag}`;

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.KickMembers)) {
      await interaction.editReply({ content: 'Botta **Üyeleri At** yetkisi yok.', flags: EPHEMERAL });
      return;
    }

    try {
      await target.kick(kickReason);
    } catch (e) {
      await interaction.editReply({
        content: `Atma başarısız: ${e.message || 'bilinmeyen hata'}`,
        flags: EPHEMERAL,
      });
      return;
    }

    await interaction.editReply({ content: `**${target.user.tag}** sunucudan atıldı.`, flags: EPHEMERAL });
  },
};
