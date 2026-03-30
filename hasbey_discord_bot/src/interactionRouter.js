const { EmbedBuilder } = require('discord.js');
const { EPHEMERAL } = require('./lib/discordFlags');
const { readGuildConfig } = require('./lib/storage');
const { isGuildSetup, canOperateServer } = require('./lib/guards');
const { resolveMemberRoleId, resolveGuestRoleId } = require('./lib/resolveRoles');
const { resolveRegistrationLogTargetId } = require('./lib/resolveChannels');
const { ensureBotData } = require('./services/tempVoice');
const { runKur } = require('./commands/kur');
const { runYedekle } = require('./commands/yedekle');
const { showKaydolModal } = require('./commands/kaydol');
const { meHas, NEED_MANAGE } = require('./lib/permissions');
const { updateLastRegisteredDisplay } = require('./services/channelStatus');
const { clearGuestRegisterDmOnce } = require('./lib/guestRegisterDmOnceState');

function pendingKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/** Sunucu takma adı — @ ` ve boşluk normalize, max 32 */
function normalizeServerNickname(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/[@|`]/g, '')
    .trim()
    .slice(0, 32);
}

/** Takma ad | yaş — Discord 32 karakter sınırına sığdır */
function buildNicknameNickAge(nickPart, ageNum) {
  const nick = String(nickPart || '').trim();
  const ageStr = String(ageNum);
  const sep = ' | ';
  let combined = `${nick}${sep}${ageStr}`;
  if (combined.length <= 32) return combined;
  const room = 32 - sep.length - ageStr.length;
  if (room < 1) return ageStr.slice(0, 32);
  const shortNick = nick.slice(0, room).trim();
  return `${shortNick}${sep}${ageStr}`.slice(0, 32);
}

/** Slash için önce defer edildiyse editReply, yoksa reply (ör. kaydol / showModal) */
async function slashRespond(interaction, options) {
  if (interaction.deferred) {
    return interaction.editReply(options);
  }
  return interaction.reply(options);
}

async function handleModalSubmit(interaction) {
  if (interaction.customId !== 'hby:kaydol') return false;

  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: 'Kayıt yalnızca sunucuda yapılabilir.', flags: EPHEMERAL });
    return true;
  }

  const cfg = readGuildConfig(interaction.guild.id);
  if (!isGuildSetup(cfg)) {
    await interaction.reply({ content: 'Sunucu kurulumu yok.', flags: EPHEMERAL });
    return true;
  }
  const memberRoleId = resolveMemberRoleId(interaction.guild, cfg);
  if (!memberRoleId) {
    await interaction.reply({
      content:
        'Kayıtlı rolü çözülemedi. `guilds` kaydında `memberRoleId` yoksa sunucuda **Kayıtlı** adlı bir rol olmalı (veya `memberRoleName` ile eşleşmeli).',
      flags: EPHEMERAL,
    });
    return true;
  }

  const adsoyad = String(interaction.fields.getTextInputValue('adsoyad') || '')
    .replace(/\s+/g, ' ')
    .trim();
  const nickRaw = interaction.fields.getTextInputValue('nick');
  const yas = interaction.fields.getTextInputValue('yas');
  const nick = normalizeServerNickname(nickRaw);
  if (!adsoyad || !nick) {
    await interaction.reply({
      content: 'Ad soyad ve sunucu takma adı zorunlu; geçerli değerler gir.',
      flags: EPHEMERAL,
    });
    return true;
  }

  const ageNum = parseInt(String(yas).replace(/\D/g, ''), 10);
  if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 120) {
    await interaction.reply({ content: 'Geçerli bir yaş gir (1–120).', flags: EPHEMERAL });
    return true;
  }

  const guestRoleId = resolveGuestRoleId(interaction.guild, cfg);
  if (guestRoleId) {
    try {
      await interaction.member.roles.remove(guestRoleId, 'Kayıt (/kaydol)');
    } catch {
      /* */
    }
  }

  try {
    await interaction.member.roles.add(memberRoleId, 'Kayıt (/kaydol)');
  } catch {
    await interaction.reply({ content: 'Rol verilemedi (rol hiyerarşisi / yetki).', flags: EPHEMERAL });
    return true;
  }

  clearGuestRegisterDmOnce(interaction.guild.id, interaction.user.id);

  const useNickAge = cfg.features?.registrationNickAgeFormat !== false;
  const appliedServerNick = useNickAge ? buildNicknameNickAge(nick, ageNum) : null;

  if (useNickAge && appliedServerNick) {
    try {
      await interaction.member.setNickname(appliedServerNick, 'Kayıt /kaydol');
    } catch {
      /* Yetki yok veya sunucu sahibi — sessiz */
    }
  }

  const logId = resolveRegistrationLogTargetId(cfg);
  const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
  if (cfg.features?.registrationLog !== false && logCh?.isTextBased()) {
    const discLine =
      [interaction.user.globalName, interaction.user.username].filter(Boolean).join(' · ') ||
      interaction.user.username;
    const embed = new EmbedBuilder()
      .setTitle('📋 Yeni kayıt')
      .setDescription(`Üye: <@${interaction.user.id}>`)
      .addFields(
        { name: 'Ad soyad', value: adsoyad.slice(0, 256) || '—', inline: false },
        { name: 'Form takma adı', value: nick || '—', inline: true },
        { name: 'Yaş', value: String(ageNum), inline: true },
        {
          name: 'Sunucu adı uygulaması',
          value: useNickAge ? `**${appliedServerNick || '—'}**` : 'Kapalı (eklenti)',
          inline: false,
        },
        { name: 'Discord kullanıcı adı (değişmez)', value: discLine.slice(0, 80), inline: false },
        { name: 'Hesap', value: `\`${interaction.user.id}\``, inline: true }
      )
      .setColor(0x5865f2)
      .setTimestamp(new Date());
    await logCh.send({ embeds: [embed] }).catch(() => {});
  }

  try {
    await updateLastRegisteredDisplay(
      interaction.client,
      interaction.guild,
      cfg,
      useNickAge ? appliedServerNick || nick : nick
    );
  } catch (e) {
    console.error('[kaydol modal]', e);
  }

  const nickMsg = useNickAge
    ? `Sunucu takma adın: **${appliedServerNick}** (Takma ad | yaş).`
    : 'Sunucu takma adın **değiştirilmedi** (Takma ad | yaş eklentisi kapalı).';
  await interaction.reply({
    content: `✅ Kayıt tamamlandı. ${nickMsg} Discord kullanıcı adın aynı kaldı. Diğer kanalları görebilirsin.`,
    flags: EPHEMERAL,
  });
  return true;
}

async function handleButton(interaction) {
  const id = interaction.customId;
  if (!id.startsWith('hby:')) return false;

  if (id === 'hby:kaydol_open') {
    await showKaydolModal(interaction);
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
  const slashHerKanal = name === 'komutlar' || name === 'kaydol';
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
    await slashRespond(interaction, {
      content: 'Bu bot henüz **kurulmadı**. Yönetim `/start` ile sahiplik kaydı yapmalı.',
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
  if (interaction.isModalSubmit()) {
    const ok = await handleModalSubmit(interaction);
    if (ok) return;
  }

  if (interaction.isButton()) {
    const ok = await handleButton(interaction);
    if (ok) return;
  }

  if (interaction.isChatInputCommand()) {
    const noDefer = interaction.commandName === 'kaydol';
    if (!noDefer) {
      await interaction.deferReply({ flags: EPHEMERAL });
    }
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
