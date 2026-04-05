const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  readGuildConfig,
  writeGuildConfig,
  hasGuildTemplateBackup,
  loadGuildTemplateBackup,
} = require('../lib/storage');
const { meHas, NEED_MANAGE } = require('../lib/permissions');
const { isGuildSetup, canOperateServer } = require('../lib/guards');
const { ensureBotData } = require('../services/tempVoice');
const { restoreGuildFromBackup, mergeConfigAfterRestore } = require('../services/restoreFromBackup');
const { deleteAllChannelsAndRoles, installDefaultTemplate } = require('../services/defaultTemplate');
const { EPHEMERAL } = require('../lib/discordFlags');

async function grantPostSetupRoles(guild, cfg, actorUserId) {
  const ownerRoleId = cfg?.roles?.ownerRoleId ? String(cfg.roles.ownerRoleId).trim() : '';
  const botRoleId = cfg?.roles?.botTagRoleId ? String(cfg.roles.botTagRoleId).trim() : '';

  const ownerRole =
    guild.roles.cache.get(ownerRoleId) ||
    guild.roles.cache.find((r) => r.name.includes('ᴏᴡɴᴇʀ') || r.name.toLowerCase() === 'owner');
  const botRole =
    guild.roles.cache.get(botRoleId) ||
    guild.roles.cache.find((r) => r.name.includes('ʙᴏᴛ') || r.name.toLowerCase() === 'bot');

  const actor = await guild.members.fetch(actorUserId).catch(() => null);
  if (actor && ownerRole) {
    await actor.roles.add(ownerRole.id, '/kur yapan uyeye owner rolu').catch(() => {});
  }

  const me = guild.members.me || (await guild.members.fetch(guild.client.user.id).catch(() => null));
  if (me && botRole) {
    await me.roles.add(botRole.id, 'Bota bot rolu').catch(() => {});
    if (botRole.editable && !botRole.managed) {
      await botRole
        .setPosition(1, { relative: false, reason: 'HasBEY: bot rolü en alta' })
        .catch(() => {});
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kur')
    .setDescription('Yedek JSON ile boş sunucuda kanal, rol ve izinleri kurar (data/backups veya import).'),

  async execute(interaction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.editReply({ content: 'Bu komut sadece sunucuda kullanılabilir.', flags: EPHEMERAL });
      return;
    }

    const gid = interaction.guild.id;
    const cfg = readGuildConfig(gid);
    if (!isGuildSetup(cfg)) {
      await interaction.editReply({ content: 'Önce `/start` çalıştırın.', flags: EPHEMERAL });
      return;
    }
    if (!canOperateServer(interaction.member, cfg)) {
      await interaction.editReply({ content: 'Bu komutu kullanma izniniz yok.', flags: EPHEMERAL });
      return;
    }
    if (!meHas(interaction.guild, NEED_MANAGE)) {
      await interaction.editReply({
        content: 'Botta **Kanalları Yönet** + **Rolleri Yönet** yetkisi olmalı.',
        flags: EPHEMERAL,
      });
      return;
    }

    if (cfg.channels?.lobbyVoiceId) {
      await interaction.editReply({
        content:
          'Bu sunucuda HasBEY **zaten yapılandırılmış** görünüyor (`lobbyVoiceId` dolu). `/kur` yalnızca boş veya çok sade sunucular içindir.',
        flags: EPHEMERAL,
      });
      return;
    }

    const hasBackup = hasGuildTemplateBackup(gid);
    const confirmText = hasBackup
      ? '✅ **Onay Asamasi**\n' +
        '- Sunucuda yedek bulundu.\n' +
        '- Mevcut rol/kanallar temizlenip yedekten geri kurulacak.\n\n' +
        'Devam edilsin mi?'
      : '✅ **Onay Asamasi**\n' +
        '- Sunucuda herhangi bir yedege rastlanmadi.\n' +
        '- Default HasBEY sablonu kurulacak.\n' +
        '- Bos sunucuda rol/kanal silme yapilmaz.\n\n' +
        'Devam edilsin mi?';

    await interaction.editReply({
      content: confirmText,
      flags: EPHEMERAL,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('hby:confirm:kur').setLabel('Sablonu Kur').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('hby:cancel:kur').setLabel('Hayır').setStyle(ButtonStyle.Secondary)
        ),
      ],
    });

    ensureBotData(interaction.client).pendingConfirm.set(`${gid}:${interaction.user.id}`, {
      type: 'kur',
      expires: Date.now() + 120_000,
    });
  },
};

module.exports.runKur = async (interaction) => {
  const gid = interaction.guild.id;
  const cfg = readGuildConfig(gid);
  const payload = hasGuildTemplateBackup(gid) ? loadGuildTemplateBackup(gid) : null;
  if (payload) {
    try {
      await deleteAllChannelsAndRoles(interaction.guild);
      const { roleMap, channelMap, memberRestore } = await restoreGuildFromBackup(interaction.guild, payload);
      const next = mergeConfigAfterRestore(cfg, gid, payload, roleMap, channelMap);
      writeGuildConfig(gid, next);
      await grantPostSetupRoles(interaction.guild, next, interaction.user.id);
      let memberLine = '';
      if (Array.isArray(payload.members) && payload.members.length > 0 && memberRestore) {
        memberLine = `\n• Üye rolleri: ${memberRestore.applied} güncellendi, ${memberRestore.skipped} atlandı (sunucuda yok / eşleşmeyen rol), ${memberRestore.failed} hata.`;
      }
      await interaction.followUp({
        content:
          '✅ **Yedekten kurulum bitti.** Roller/kanallar temizlenip yedekten geri yüklendi, kanal/rol ID alanlari guncellendi.' +
          memberLine,
        flags: EPHEMERAL,
      });
    } catch (e) {
      await interaction.followUp({
        content:
          `❌ Yedekten kurulum basarisiz: ${e.message}\n` +
          'Bot rolunde **Kanallari Yonet + Rolleri Yonet** oldugunu ve bot rolunun ustte oldugunu kontrol edin.',
        flags: EPHEMERAL,
      });
    }
    return;
  }

  try {
    await deleteAllChannelsAndRoles(interaction.guild);
    const applied = await installDefaultTemplate(interaction.guild, cfg.botOwnerId || interaction.user.id);
    const next = { ...cfg, ...applied };
    writeGuildConfig(gid, next);
    await grantPostSetupRoles(interaction.guild, next, interaction.user.id);
    await interaction.followUp({
      content:
        '✅ **Varsayilan sablon kuruldu.** Yedek bulunmadigi icin varsayilan kanal/roller temizlenip HasBEY sablonu olusturuldu.',
      flags: EPHEMERAL,
    });
  } catch (e) {
    await interaction.followUp({
      content:
        `❌ Varsayilan sablon kurulamadi: ${e.message}\n` +
        'Bot rolunde **Kanallari Yonet + Rolleri Yonet** oldugunu ve bot rolunun ustte oldugunu kontrol edin.',
      flags: EPHEMERAL,
    });
  }
};

