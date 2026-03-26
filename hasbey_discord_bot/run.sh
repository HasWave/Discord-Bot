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
        process.stdout.write(String(o.client_id || ''));
      } catch (e) {}
    "
  )"
  export GUILD_ID="$(
    node -e "
      const fs = require('fs');
      try {
        const o = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
        process.stdout.write(String(o.guild_id || ''));
      } catch (e) {}
    "
  )"
fi

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
