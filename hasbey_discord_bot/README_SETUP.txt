HasBEY Discord Bot — Home Assistant Supervisor (ayrı paket)

Bu klasör ana bot deposundan BAĞIMSIZ Supervisor/GitHub paketidir (tek HA kaynağı).
Depo kökündeki bot ayrı çalışır; bu ağaç GitHub / Supervisor için.

──────────────────────────────────────────────────────────────────
1) Paketi üret
──────────────────────────────────────────────────────────────────

Ana depot kökünden (HasBEY Discord Bot):

  node seri_github_tool/hasbey_discord_home_assistant/scripts/sync-addon-from-main.js

Çıktı: seri_github_tool/hasbey_discord_home_assistant/supervisor-addon-repo/
  • repository.json
  • hasbey_discord_bot/  ← Dockerfile, config.yaml, bot kaynakları
  • BASLAT_SERI_GITHUB.bat ← GitHub menü aracını buradan çalıştır (bu klasördeki baslat.bat kullanma)

──────────────────────────────────────────────────────────────────
2) GitHub
──────────────────────────────────────────────────────────────────

• supervisor-addon-repo/ içeriğini yeni bir repo köküne kopyala.
• repository.json → "url" alanını gerçek repo adresinle değiştir, push et.
• Home Assistant → Eklentiler → Mağaza → Depolar → Depo ekle → bu URL.

Yerel add-on: sadece hasbey_discord_bot/ klasörünü /addons/ altına kopyala,
  Ayarlar → Eklentiler → Yerel eklentileri yenile → Derle.

──────────────────────────────────────────────────────────────────
3) Notlar
──────────────────────────────────────────────────────────────────

• HACS bu eklenti tipini mağazalamaz; Supervisor "Depo ekle" kullanılır.
• Slash komutları: ana botta token ile  npm run deploy-commands
• Kalıcı veri: host share altında hasbey_discord_bot_data
• AppDaemon Python klasörü bu bot için kullanılmaz.

Derleme hatasında: Supervisor günlükleri (ha supervisor logs).
  build_from alaninda kisa "node:22-alpine" KULLANMA — Supervisor reddeder;
  "docker.io/library/node:22-alpine" tam yol kullanilir (npm icin gerekli).

Yapılandırma (config.yaml / eklenti paneli)

  • Önerilen (PC’de zaten /start yapıldıysa):
    discord_token + guild_id (Sunucu ID) yeterli.
    Oluşan dosyayı hostta şuraya koyun:
      /share/hasbey_discord_bot_data/guilds/<AYNI_SUNUCU_ID>.json
    Diğer kanal/rol alanlarını boş bırakabilirsiniz; bot mevcut JSON’u olduğu gibi kullanır.

  • HA’dan sıfır kurmak veya ID’leri panelden yazmak isterseniz:
    bot_guest_slash_channel_id, bot_guest_role_id, isteğe bot_member_role_id,
    bot_owner_user_id vb. doldurun.
    Bot her başlangıçta yalnızca DOLU ve geçerli snowflake alanları
    /data/options.json → data/guilds/<guild_id>.json ile birleştirir; boş alanlar dosyayı silmez.

Yapılandırma → bot_guest_role_id / bot_member_role_id:
  Bu değerler kayda yazılır. Bot yeni üyeye
  misafir rolünü (guestRoleId), /kaydol ile kayıtlı rolü (memberRoleId) verir ve
  misafiri kaldırır. Misafir rol ID’si, Discord’da “Sunucu durumu” kategorisi ve
  misafir bot komut kanalı izinlerinde kullandığınız rol ile aynı olmalı.
  Büyük harf (BOT_GUEST_ROLE_ID vb.) veya yazım varyantları options/env ile de okunur.

• bot_owner_user_id (Discord kullanıcı snowflake ID’si):
  options.json / env ile verilirse data/guilds dosyasında setupComplete açılır; yalnızca
  HA’dan kanal/rol gelip Discord’da /start yapılmamışsa üyelik akışı (misafir + Kayıt Ol)
  yine çalışır. Yeniden katılan üyeler için de bot rolünün misafir rolünden üstte
  olması ve misafir bot komut kanalına “Mesaj Gönder” yetkisi gerekir.
