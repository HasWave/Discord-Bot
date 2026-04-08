const { EmbedBuilder } = require('discord.js');
const { EPHEMERAL } = require('./lib/discordFlags');
const { readGuildConfig } = require('./lib/storage');
const { isGuildSetup, canOperateServer } = require('./lib/guards');
const { resolveMemberRoleId, resolveGuestRoleId } = require('./lib/resolveRoles');
const { resolveRegistrationLogTargetId } = require('./lib/resolveChannels');
const { ensureBotData } = require('./services/tempVoice');
const { runKur } = require('./commands/kur');
const { runYedekle } = require('./commands/yedekle');
const { meHas, NEED_MANAGE } = require('./lib/permissions');
const { updateLastRegisteredDisplay } = require('./services/channelStatus');
const { clearGuestRegisterDmOnce } = require('./lib/guestRegisterDmOnceState');

/** Eklenti: staffModerationCommands — kapalıyken yanıt verilmez */
const STAFF_MOD_SLASH = new Set(['at', 'kilitle', 'limit', 'devret', 'ban', 'kick', 'unban']);

function pendingKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/** Slash için önce defer edildiyse editReply, yoksa reply */
async function slashRespond(interaction, options) {
  if (interaction.deferred) {
    return interaction.editReply(options);
  }
  return interaction.reply(options);
}

/**
 * Misafir → teşkilat: form yok; Kayıt Ol butonu.
 */
async function completeJoinFromButton(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const cfg = readGuildConfig(guild.id);

  if (!isGuildSetup(cfg)) {
    await interaction.editReply({ content: 'Sunucu henüz kurulmadı. Yönetim `/start` yapmalı.' });
    return;
  }

  const memberRoleId = resolveMemberRoleId(guild, cfg);
  if (!memberRoleId) {
    await interaction.editReply({
      content:
        'Teşkilat rolü bulunamadı. Yapılandırmada **Kayıtlı** rolü (`memberRoleId` / `memberRoleName`) tanımlı olmalı.',
    });
    return;
  }

  if (member.roles.cache.has(memberRoleId)) {
    await interaction.editReply({ content: 'Zaten **teşkilat** üyesisin.' });
    return;
  }

  const guestRoleId = resolveGuestRoleId(guild, cfg);
  if (guestRoleId && !member.roles.cache.has(guestRoleId)) {
    await interaction.editReply({
      content:
        'Bu buton yalnızca **misafir** rolündeki üyeler içindir. Sorun devam ederse bir yöneticiye yaz.',
    });
    return;
  }

  if (guestRoleId) {
    await member.roles.remove(guestRoleId, 'Kayıt Ol (buton)').catch(() => {});
  }

  try {
    await member.roles.add(memberRoleId, 'Kayıt Ol (buton)');
  } catch {
    await interaction.editReply({ content: 'Rol verilemedi (rol hiyerarşisi veya bot yetkisi).' });
    return;
  }

  clearGuestRegisterDmOnce(guild.id, member.id);

  const displayForLastReg = member.displayName || member.user.globalName || member.user.username;
  try {
    await updateLastRegisteredDisplay(interaction.client, guild, cfg, displayForLastReg);
  } catch (e) {
    console.error('[kayit buton] son kayit kanali', e);
  }

  const logId = resolveRegistrationLogTargetId(cfg);
  const logCh = logId ? guild.channels.cache.get(logId) : null;
  if (logCh?.isTextBased()) {
    const embed = new EmbedBuilder()
      .setTitle('✅ Teşkilata katılım')
      .setDescription(`Üye: ${member}`)
      .setColor(0x57f287)
      .setTimestamp(new Date());
    await logCh.send({ embeds: [embed] }).catch(() => {});
  }

  await interaction.editReply({
    content:
      '✅ **Kayıt tamamlandı.** Teşkilat rolün verildi; artık sunucunun diğer kanallarına erişebilirsin.',
  });

  const welcomeMsg = interaction.message;
  if (welcomeMsg?.author?.id === interaction.client.user.id) {
    await welcomeMsg.delete().catch(() => {});
  }
}

async function handleButton(interaction) {
  const id = interaction.customId;
  if (!id.startsWith('hby:')) return false;

  if (id === 'hby:kaydol_open') {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({ content: 'Bu işlem yalnızca sunucuda yapılabilir.', flags: EPHEMERAL });
      return true;
    }

    const cfg = readGuildConfig(interaction.guild.id);
    const guestCh = cfg.channels?.guestSlashCommandsChannelId
      ? String(cfg.channels.guestSlashCommandsChannelId).trim()
      : '';
    if (guestCh && interaction.channelId !== guestCh) {
      await interaction.reply({
        content: `Kayıt için **Kayıt Ol** butonunu yalnızca misafir bot komut kanalında kullan: <#${guestCh}>.`,
        flags: EPHEMERAL,
      });
      return true;
    }

    await interaction.deferReply({ flags: EPHEMERAL });
    await completeJoinFromButton(interaction);
    return true;
  }

  const [, action, kind] = id.split(':');
  if (action !== 'confirm' && action !== 'cancel') return false;

  const cfg = readGuildConfig(interaction.guild.id);
  if (!isGuildSetup(cfg)) {
    await interaction.reply({ content: 'Önce `/start`.', flags: EPHEMERAL });
    return true;
  }
  if (!canOperateServer(interaction.member, cfg)) {
    await interaction.reply({ content: 'Yetkin yok.', flags: EPHEMERAL });
    return true;
  }

  const bd = ensureBotData(interaction.client);
  const key = pendingKey(interaction.guild.id, interaction.user.id);
  const pending = bd.pendingConfirm.get(key);
  if (!pending || (pending.expires && Date.now() > pending.expires)) {
    bd.pendingConfirm.delete(key);
    await interaction.reply({ content: 'Onay süresi doldu veya onay bulunamadı.', flags: EPHEMERAL });
    return true;
  }

  if (kind === 'kur' && pending.type !== 'kur') {
    await interaction.reply({ content: 'Geçersiz onay.', flags: EPHEMERAL });
    return true;
  }
  if (kind === 'yedekle' && pending.type !== 'yedekle') {
    await interaction.reply({ content: 'Geçersiz onay.', flags: EPHEMERAL });
    return true;
  }

  if (action === 'cancel') {
    bd.pendingConfirm.delete(key);
    await interaction.update({ content: 'İptal edildi.', components: [] });
    return true;
  }

  bd.pendingConfirm.delete(key);
  await interaction.update({ content: 'İşlem yapılıyor…', components: [] });

  try {
    if (kind === 'kur') {
      if (!meHas(interaction.guild, NEED_MANAGE)) {
        await interaction.followUp({
          content: 'Botta **Kanalları Yönet** + **Rolleri Yönet** yetkisi yok.',
          flags: EPHEMERAL,
        });
        return true;
      }
      await runKur(interaction);
    } else if (kind === 'yedekle') {
      await runYedekle(interaction);
    }
  } catch (e) {
    console.error(e);
    await interaction
      .followUp({ content: `İşlem başarısız: ${e.message}`, flags: EPHEMERAL })
      .catch(() => {});
  }

  return true;
}

async function routeSlash(interaction, commands) {
  const name = interaction.commandName;

  const startCmd = commands.get('start');
  if (name === 'start') {
    if (!startCmd) {
      await slashRespond(interaction, { content: '`/start` komutu yüklü değil.', flags: EPHEMERAL });
      return;
    }
    await startCmd.execute(interaction);
    return;
  }

  if (name === 'pin') {
    const cmd = commands.get('pin');
    if (cmd) await cmd.execute(interaction);
    else {
      await slashRespond(interaction, {
        content:
          '`/pin` yüklü değil — botu yeniden başlatın, ardından `npm run deploy-commands` çalıştırın.',
        flags: EPHEMERAL,
      });
    }
    return;
  }

  if (!interaction.inGuild() || !interaction.member) {
    await slashRespond(interaction, {
      content: 'Bu komut sadece sunucuda kullanılabilir.',
      flags: EPHEMERAL,
    });
    return;
  }

  const cfgPre = readGuildConfig(interaction.guild.id);
  const onlyCh = cfgPre.channels?.slashCommandsChannelId
    ? String(cfgPre.channels.slashCommandsChannelId).trim()
    : '';
  const guestCmdCh = cfgPre.channels?.guestSlashCommandsChannelId
    ? String(cfgPre.channels.guestSlashCommandsChannelId).trim()
    : '';
  const slashHerKanal = name === 'komutlar' || name === 'afk_mod';
  const chId = interaction.channelId ? String(interaction.channelId).trim() : '';
  /** Misafir kanalı, ana kanaldan farklı bir ID ise ek izinli kanal sayılır. */
  const guestDistinct = Boolean(guestCmdCh && guestCmdCh !== onlyCh);
  const restrictSlash = Boolean(onlyCh) || guestDistinct;
  const inAllowedSlashChannel =
    !restrictSlash ||
    (onlyCh && chId === onlyCh) ||
    (guestDistinct && chId === guestCmdCh);

  if (!inAllowedSlashChannel && !slashHerKanal) {
    const parts = [];
    if (onlyCh) parts.push(`<#${onlyCh}>${guestDistinct ? ' (Kayıtlı)' : ''}`);
    if (guestDistinct) parts.push(`<#${guestCmdCh}> (**Misafir**)`);
    const where = parts.length ? ` ${parts.join(' · ')}` : '';
    await slashRespond(interaction, {
      content: `🔔 Slash komutları bu sunucuda yalnızca şu kanallarda kullanılabilir:${where}`,
      flags: EPHEMERAL,
    });
    return;
  }

  if (!isGuildSetup(cfgPre)) {
    if (name === 'komutlar') {
      const komutlarCmd = commands.get('komutlar');
      if (!komutlarCmd) {
        await slashRespond(interaction, { content: 'komutlar yüklü değil.', flags: EPHEMERAL });
        return;
      }
      await komutlarCmd.execute(interaction);
      return;
    }
    if (name === 'afk_mod') {
      const afkModCmd = commands.get('afk_mod');
      if (!afkModCmd) {
        await slashRespond(interaction, { content: '`/afk_mod` yüklü değil.', flags: EPHEMERAL });
        return;
      }
      await afkModCmd.execute(interaction);
      return;
    }
    await slashRespond(interaction, {
      content: 'Bu bot henüz **kurulmadı**. Yönetim `/start` ile sahiplik kaydı yapmalı.',
      flags: EPHEMERAL,
    });
    return;
  }

  if (STAFF_MOD_SLASH.has(name) && cfgPre.features?.staffModerationCommands === false) {
    await slashRespond(interaction, {
      content:
        '**Yetkili slash komutları** bu sunucuda kapalı. Menü → **Discord Ayarları** → **Eklentiler** üzerinden açın (/at, /ban, /kick, geçici oda komutları vb.).',
      flags: EPHEMERAL,
    });
    return;
  }

  const cmd = commands.get(name);
  if (!cmd) {
    await slashRespond(interaction, { content: 'Komut bulunamadı.', flags: EPHEMERAL });
    return;
  }
  await cmd.execute(interaction);
}

async function handleInteraction(interaction, commands) {
  if (interaction.isButton()) {
    const ok = await handleButton(interaction);
    if (ok) return;
  }

  if (interaction.isChatInputCommand()) {
    await interaction.deferReply({ flags: EPHEMERAL });
    try {
      await routeSlash(interaction, commands);
    } catch (e) {
      console.error('[slash]', e);
      try {
        await slashRespond(interaction, {
          content: 'Komut işlenirken hata oluştu.',
          flags: EPHEMERAL,
        });
      } catch (_) {
        try {
          await interaction.followUp({ content: 'Komut işlenirken hata oluştu.', flags: EPHEMERAL });
        } catch (_2) {
          /* */
        }
      }
    }
  }
}

module.exports = { handleInteraction };
