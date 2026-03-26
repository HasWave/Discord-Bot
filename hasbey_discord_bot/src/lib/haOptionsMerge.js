/**
 * Home Assistant Supervisor: /data/options.json → data/guilds/<guild_id>.json birleştirme.
 * Yalnızca HA eklenti paketinde kullanılır; ana HasBEY bot deposunda yoktur.
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

const HA_ROLE_OPTIONS = [
  ['bot_member_role_id', 'memberRoleId'],
  ['bot_guest_role_id', 'guestRoleId'],
];

function isSnowflake(s) {
  return /^\d{17,22}$/.test(String(s).trim());
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

  const guildId = String(opt.guild_id || process.env.GUILD_ID || '').trim();
  if (!isSnowflake(guildId)) {
    return;
  }

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

  for (const [optKey, cfgKey] of HA_ROLE_OPTIONS) {
    if (!(optKey in opt)) {
      continue;
    }
    const v = String(opt[optKey] ?? '').trim();
    if (!v || !isSnowflake(v)) {
      continue;
    }
    if (roles[cfgKey] !== v) {
      roles[cfgKey] = v;
      changed = true;
    }
  }

  if (!changed) {
    return;
  }

  writeGuildConfig(guildId, { ...cfg, channels, roles });
  console.log(
    chalk.cyan(`[HA Supervisor] Eklenti yapılandırması → data/guilds/${guildId}.json birleştirildi.`)
  );
}

module.exports = { applyHomeAssistantOptionsMerge };
