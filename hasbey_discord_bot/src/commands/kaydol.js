const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { readGuildConfig } = require('../lib/storage');
const { isGuildSetup } = require('../lib/guards');
const { resolveMemberRoleId } = require('../lib/resolveRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kaydol')
    .setDescription('Ad soyad, sunucu takma adın ve yaş; Discord kullanıcı adın değişmez'),

  async execute(interaction) {
    await showKaydolModal(interaction);
  },
};

async function showKaydolModal(interaction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({ content: 'Bu komut sadece sunucuda kullanılabilir.', flags: EPHEMERAL });
      return;
    }

    const cfg = readGuildConfig(interaction.guild.id);
    if (!isGuildSetup(cfg)) {
      await interaction.reply({ content: 'Önce yönetim `/start` yapmalı.', flags: EPHEMERAL });
      return;
    }
    const memberRoleId = resolveMemberRoleId(interaction.guild, cfg);
    if (!memberRoleId) {
      await interaction.reply({
        content:
          'Kayıtlı rolü bulunamadı. Sunucuda **Kayıtlı** rolü yoksa oluşturun veya yapılandırmada `memberRoleId` / `memberRoleName` ayarlayın.',
        flags: EPHEMERAL,
      });
      return;
    }
    if (interaction.member.roles.cache.has(memberRoleId)) {
      await interaction.reply({ content: 'Zaten kayıtlısın.', flags: EPHEMERAL });
      return;
    }

    const modal = new ModalBuilder().setCustomId('hby:kaydol').setTitle('Kayıt');

    const adsoyad = new TextInputBuilder()
      .setCustomId('adsoyad')
      .setLabel('Ad ve soyad')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(80);

    const nick = new TextInputBuilder()
      .setCustomId('nick')
      .setLabel('Sunucuda görünecek takma adın')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('En fazla 32 karakter')
      .setMaxLength(32);

    const yas = new TextInputBuilder()
      .setCustomId('yas')
      .setLabel('Yaş')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(3);

    modal.addComponents(
      new ActionRowBuilder().addComponents(adsoyad),
      new ActionRowBuilder().addComponents(nick),
      new ActionRowBuilder().addComponents(yas)
    );

    await interaction.showModal(modal);
}

module.exports.showKaydolModal = showKaydolModal;
