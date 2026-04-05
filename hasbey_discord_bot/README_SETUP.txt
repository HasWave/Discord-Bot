HasBEY Discord Bot — Home Assistant Supervisor (GitHub → Depo ekle → Kur)

Bu klasör ana depodaki bot ile aynı src kullanır; Docker içinde yalnız node bot.js çalışır.

──────────────────────────────────────────────────────────────────
Hedef: Token + Sunucu ID kaydet → Yeniden başlat → Discord’da çevrimiçi
──────────────────────────────────────────────────────────────────

1) GitHub’a bu repo’yu (Upload_Project veya sadece hasbey_discord_bot kökü) push edin.
   repository.json içindeki "url" gerçek repo adresiniz olsun.

2) HA: Eklentiler → Depo ekle → HasBEY Discord Bot → Kur / Derle.

3) Yapılandırma (2 alan):
   • discord_token — Developer Portal → Bot → Token (göz ikonlu alan)
   • guild_id — Sunucu ID (rakamlar) veya .../guilds/123...json URL’si

4) Sunucu JSON (kanal/rol):
   /share/hasbey_discord_bot_data/guilds/<guild_id>.json
   PC’de /start sonrası oluşan data/guilds/<id>.json dosyasının içeriğini buraya koyun.

5) Kaydet → Eklentiyi Başlat. Günlükte: "Bot başlatıldı" / "Oturum açıldı" görmelisiniz.

6) Slash: PC’de ana depoda aynı token ile: npm run deploy-commands

7) Dikkat:
   • İmajda config.json YOK; token yalnızca HA yapılandırmasından gelir.
   • Aynı token ile PC’de ve Pi’de aynı anda bot çalıştırmayın (tek oturum).
   • İzleme (Watchdog) çökme döngüsünde geçici kapatılabilir.
