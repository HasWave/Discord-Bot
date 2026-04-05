HasBEY Discord Bot — Home Assistant Supervisor (kök bot ile aynı kod)

Mimari: aarch64 + amd64 (Supervisor armv7/armhf/i386 artık “deprecated” uyarısı verir; HA 64-bit Pi önerir).
Derleme: build.yaml resmi Node 20 (bookworm-slim); Alpine/yanlış
BUILD_FROM yüzünden oluşan “unknown error” engellenir. @napi-rs/canvas için Dockerfile’da
python3/make/g++ vardır.

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

Rol ID (panelde yalnız bunlar):
  bot_guest_role_id   — Misafir rolü
  bot_member_role_id  — Kayıt olunca verilecek (teşkilat) rolü
  Diğer şablon rolleri: /start veya guild JSON’da; Supervisor formunda yok.

Her başlangıç: /data/options.json → data/guilds/<guild_id>.json birleştirilir.

Kalıcı veri: /share/hasbey_discord_bot_data

Slash: PC’de ana depoda npm run deploy-commands (aynı token).
