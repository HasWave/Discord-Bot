const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup } = require('../lib/guards');

const SNOWFLAKE = /^\d{17,20}$/;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Yasaklı kullanıcının yasağını kaldır (kullanıcı ID)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName('kullanici_id').setDescription('Discord kullanıcı ID (sayı)').setRequired(true).setMaxLength(22)
    )
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

    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction.editReply({ content: '**Üyeleri Yasakla** yetkin yok.', flags: EPHEMERAL });
      return;
    }

    const idRaw = interaction.options.getString('kullanici_id', true).trim();
    if (!SNOWFLAKE.test(idRaw)) {
      await interaction.editReply({ content: 'Geçerli bir **kullanıcı ID** gir (17–20 haneli sayı).', flags: EPHEMERAL });
      return;
    }

    const guild = interaction.guild;
    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction.editReply({ content: 'Botta **Üyeleri Yasakla** yetkisi yok.', flags: EPHEMERAL });
      return;
    }

    const reasonRaw = interaction.options.getString('sebep');
    const reason = reasonRaw?.trim() ? reasonRaw.trim().slice(0, 500) : 'Komut ile yasak kaldırıldı';
    const unbanReason = `${reason} — ${interaction.user.tag}`;

    try {
      await guild.bans.remove(idRaw, unbanReason);
    } catch (e) {
      const msg = e.code === 10026 || /unknown ban/i.test(String(e.message))
        ? 'Bu ID yasaklı listede yok veya zaten kaldırılmış.'
        : e.message || 'bilinmeyen hata';
      await interaction.editReply({ content: `Yasak kaldırılamadı: ${msg}`, flags: EPHEMERAL });
      return;
    }

    await interaction.editReply({ content: `Kullanıcı \`${idRaw}\` için yasak kaldırıldı.`, flags: EPHEMERAL });
  },
};
