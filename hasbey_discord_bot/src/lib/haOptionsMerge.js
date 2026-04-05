/**
 * Home Assistant Supervisor: /data/options.json (+ env) → data/guilds/<guild_id>.json birleştirme.
 * Docker’da config.json olmadan eklenti ekranından kanal/rol ID verildiğinde misafir akışı çalışsın diye
 * bot başlarken (index.js) çağrılır.
 *
 * Bot sahibi (isteğe bağlı): `bot_owner_user_id` → `setupComplete` + hoş geldin akışı.
 */

const fs = require('fs');
const chalk = require('chalk');
const { readGuildConfig, writeGuildConfig } = require('./storage');

const OPTIONS_JSON = '/data/options.json';

const HA_CHANNEL_OPTIONS = [
  ['bot_slash_commands_channel_id', 'slashCommandsChannelId'],
  ['bot_guest_slash_channel_id', 'guestSlashCommandsChannelId'],
  ['bot_last_registered_display_channel_id', 'lastRegisteredDisplayChannelId'],
  ['bot_member_count_channel_id', 'memberCountChannelId'],
  ['bot_lobby_voice_channel_id', 'lobbyVoiceId'],
  ['bot_temp_category_id', 'tempCategoryId'],
  ['bot_ara_command_channel_id', 'araCommandChannelId'],
  ['bot_ara_notify_channel_id', 'araNotifyChannelId'],
  ['bot_stream_announce_channel_id', 'streamAnnounceChannelId'],
  ['bot_afk_voice_channel_id', 'afkVoiceId'],
  ['bot_registration_log_channel_id', 'registrationLogChannelId'],
  ['bot_player_category_id', 'playerCategoryId'],
];

const HA_ROLE_BINDINGS = [
  {
    cfgKey: 'guestRoleId',
    optionKeys: [
      'bot_guest_role_id',
      'BOT_GUEST_ROLE_ID',
      'BOT_GUEST_ROL_ID',
      'bot_guest_rol_id',
    ],
    envKeys: ['BOT_GUEST_ROLE_ID', 'BOT_GUEST_ROL_ID', 'bot_guest_role_id', 'DEFAULT_GUEST_ROLE_ID'],
  },
  {
    cfgKey: 'memberRoleId',
    optionKeys: [
      'bot_member_role_id',
      'BOT_MEMBER_ROLE_ID',
      'BOT_MEMBER_ROL_ID',
      'bot_member_rol_id',
    ],
    envKeys: ['BOT_MEMBER_ROLE_ID', 'BOT_MEMBER_ROL_ID', 'bot_member_role_id'],
  },
];

function isSnowflake(s) {
  return /^\d{10,25}$/.test(String(s).trim());
}

function pickSnowflakeFromOptAndEnv(opt, optionKeys, envKeys) {
  if (opt && typeof opt === 'object') {
    for (const k of optionKeys) {
      if (!(k in opt)) continue;
      const v = String(opt[k] ?? '').trim();
      if (isSnowflake(v)) return v;
    }
  }
  for (const k of envKeys || []) {
    const raw = process.env[k];
    if (raw == null) continue;
    const v = String(raw).trim();
    if (isSnowflake(v)) return v;
  }
  return '';
}

function resolveGuildIdFromHa(opt) {
  return pickSnowflakeFromOptAndEnv(opt, ['guild_id', 'GUILD_ID'], ['GUILD_ID', 'guild_id']);
}

function applyHomeAssistantOptionsMerge() {
  if (!fs.existsSync(OPTIONS_JSON)) {
    return;
  }
  let opt;
  try {
    opt = JSON.parse(fs.readFileSync(OPTIONS_JSON, 'utf8'));
  } catch {
    return;
  }
  if (!opt || typeof opt !== 'object') {
    return;
  }

  const guildId = resolveGuildIdFromHa(opt);
  if (!guildId) {
    console.warn(
      chalk.yellow(
        '[HA Supervisor] options.json okundu; geçerli Sunucu ID (guild_id / GUILD_ID) yok — eklenti veya run.sh ile ayarlayın.'
      )
    );
    return;
  }

  const ownerUserId = pickSnowflakeFromOptAndEnv(
    opt,
    ['bot_owner_user_id', 'BOT_OWNER_USER_ID', 'owner_user_id'],
    ['BOT_OWNER_USER_ID', 'OWNER_USER_ID', 'bot_owner_user_id']
  );

  const cfg = readGuildConfig(guildId);
  const channels = { ...cfg.channels };
  const roles = { ...cfg.roles };
  let changed = false;

  for (const [optKey, cfgKey] of HA_CHANNEL_OPTIONS) {
    if (!(optKey in opt)) {
      continue;
    }
    const v = String(opt[optKey] ?? '').trim();
    if (!v || !isSnowflake(v)) {
      continue;
    }
    if (channels[cfgKey] !== v) {
      channels[cfgKey] = v;
      changed = true;
    }
  }

  for (const { cfgKey, optionKeys, envKeys } of HA_ROLE_BINDINGS) {
    const v = pickSnowflakeFromOptAndEnv(opt, optionKeys, envKeys);
    if (!v) {
      continue;
    }
    if (roles[cfgKey] !== v) {
      roles[cfgKey] = v;
      changed = true;
    }
  }

  let nextCfg = { ...cfg, channels, roles };
  if (ownerUserId) {
    if (nextCfg.botOwnerId !== ownerUserId) {
      nextCfg.botOwnerId = ownerUserId;
      changed = true;
    }
    if (!nextCfg.setupComplete) {
      nextCfg.setupComplete = true;
      changed = true;
    }
  }

  if (!changed) {
    return;
  }

  writeGuildConfig(guildId, nextCfg);
  console.log(
    chalk.cyan(
      `[HA Supervisor] Eklenti seçenekleri → data/guilds/${guildId}.json güncellendi (kanal/rol${ownerUserId ? ' + bot sahibi' : ''}).`
    )
  );
}

module.exports = { applyHomeAssistantOptionsMerge };
