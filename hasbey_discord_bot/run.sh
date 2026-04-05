#!/bin/sh
set -e
if [ -r /data/options.json ]; then
  export DISCORD_TOKEN="$(
    node -e "
      const fs = require('fs');
      try {
        const o = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
        process.stdout.write(String(o.discord_token || ''));
      } catch (e) {}
    "
  )"
  export CLIENT_ID="$(
    node -e "
      const fs = require('fs');
      try {
        const o = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
        process.stdout.write(String(o.client_id || '').trim());
      } catch (e) {}
    "
  )"
  if [ -n "$CLIENT_ID" ]; then
    export APPLICATION_ID="$CLIENT_ID"
  fi
  export GUILD_ID="$(
    node -e "
      const fs = require('fs');
      function parseGuildId(v) {
        const s = String(v || '').trim();
        if (/^\\d{10,25}\$/.test(s)) return s;
        const a = s.match(/guilds\\/(\\d{10,25})(?:\\.json)?/i);
        if (a) return a[1];
        const b = s.match(/(\\d{10,25})\\.json\\b/i);
        if (b) return b[1];
        const c = s.match(/discord\\.com\\/channels\\/(\\d{10,25})\\//i);
        return c ? c[1] : '';
      }
      try {
        const o = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
        process.stdout.write(parseGuildId(o.guild_id));
      } catch (e) {}
    "
  )"
fi

export HASBEY_MENU_READY_LAYOUT=1
export BOT_LOG_STACK=1

if [ -d /share ] && [ -w /share ]; then
  DATA_LINK=/share/hasbey_discord_bot_data
  mkdir -p "$DATA_LINK"
  if [ -e /app/data ] && [ ! -L /app/data ]; then
    rm -rf /app/data
  fi
  if [ ! -e /app/data ]; then
    ln -snf "$DATA_LINK" /app/data
  fi
fi

cd /app
exec node bot.js
