HasBEY Discord Bot — Home Assistant Supervisor (kök bot ile aynı kod)

──────────────────────────────────────────────────────────────────
Yapılandırma alanları (hepsi isteğe bağlı doldurulabilir, boş = JSON’da eski değer kalır)
──────────────────────────────────────────────────────────────────

Zorunlu:
  discord_token     — Bot token
  guild_id          — Sunucu ID (yalnız rakam veya .../guilds/ID.json URL)

Önerilen:
  client_id         — Uygulama ID (slash / davet linki için)
  bot_owner_user_id — Discord kullanıcı ID (setupComplete + sahip)

Kanal ID (metin/ses/kategori):
  bot_guest_slash_channel_id      — Misafir 「🤖」bot komut
  bot_slash_commands_channel_id   — Ana bot komut
  bot_registration_log_channel_id — Kayıt log
  bot_last_registered_display_channel_id — Son kayıt görünümü
  bot_member_count_channel_id    — Üye sayısı
  bot_lobby_voice_channel_id     — Geçici ses lobisi
  bot_temp_category_id           — Geçici ses kategorisi
  bot_ara_command_channel_id     — Ara bot komut
  bot_ara_notify_channel_id      — Ara bildirim
  bot_stream_announce_channel_id — Yayın duyuru
  bot_afk_voice_channel_id       — AFK ses
  bot_player_category_id         — Oyuncu kategorisi
  bot_rules_channel_id           — Kurallar
  bot_announcement_channel_id    — Duyurular

Rol ID:
  bot_guest_role_id, bot_member_role_id
  bot_owner_role_id, bot_admin_role_id, bot_mod_role_id
  bot_trial_mod_role_id, bot_kick_mod_role_id
  bot_support_role_id, bot_event_role_id, bot_streamer_role_id
  bot_developer_role_id, bot_vip_role_id, bot_tag_role_id
  bot_female_role_id, bot_drama_queen_role_id

Her başlangıç: /data/options.json → data/guilds/<guild_id>.json birleştirilir.

Kalıcı veri: /share/hasbey_discord_bot_data

Slash: PC’de ana depoda npm run deploy-commands (aynı token).
