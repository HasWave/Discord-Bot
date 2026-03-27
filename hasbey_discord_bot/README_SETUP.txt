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
