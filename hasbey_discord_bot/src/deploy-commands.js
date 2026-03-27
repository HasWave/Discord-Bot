const path = require('path');
const { ROOT } = require('./lib/paths');
const { loadProjectEnv } = require('./lib/envJson');
loadProjectEnv(ROOT);
const fs = require('fs');
const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const guildRaw = process.env.GUILD_IDS || process.env.GUILD_ID || '';

if (!token) {
  console.error('DISCORD_TOKEN yok (env.json, .env veya ortam değişkeni).');
  process.exit(1);
}

const commandsPath = path.join(__dirname, 'commands');
const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

const body = [];
const loadErrors = [];
for (const file of files) {
  try {
    const cmd = require(path.join(commandsPath, file));
    if (cmd?.data?.toJSON) body.push(cmd.data.toJSON());
    else loadErrors.push(`${file}: data.toJSON yok`);
  } catch (e) {
    loadErrors.push(`${file}: ${e.message}`);
  }
}

if (loadErrors.length) {
  console.error('Komut dosyası hatası:');
  loadErrors.forEach((l) => console.error(' ', l));
}

if (!body.length) {
  console.error(
    '\nSlash komutları YÜKLENMEDİ (liste boş). Discord’a boş kayıt göndermek TÜM slash komutlarını siler; işlem durduruldu.'
  );
  console.error('src/commands içinde geçerli komut .js dosyaları olduğundan emin ol, sonra tekrar dene.');
  process.exit(1);
}

console.log(`Kaydedilecek komutlar (${body.length}): ${body.map((c) => c.name).join(', ')}\n`);

const guildIds = guildRaw
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    let clientId = String(process.env.CLIENT_ID || process.env.APPLICATION_ID || '').trim();
    const app = await rest.get(Routes.oauth2CurrentApplication());
    const tokenAppId = String(app?.id || '').trim();
    if (!clientId) {
      clientId = tokenAppId;
      console.log(
        `ℹ CLIENT_ID tanımsız; token ile uygulama kimliği okundu: ${clientId}\n` +
          '  İstersen env.json içine ekleyebilirsin: "CLIENT_ID": "' +
          clientId +
          '"\n'
      );
    } else if (tokenAppId && clientId !== tokenAppId) {
      console.warn(
        `⚠ CLIENT_ID (${clientId}) token uygulamasıyla eşleşmiyor. Doğru uygulama kimliği kullanılacak: ${tokenAppId}`
      );
      clientId = tokenAppId;
    }

    if (guildIds.length) {
      for (const gid of guildIds) {
        await rest.put(Routes.applicationGuildCommands(clientId, gid), { body });
        console.log(`✓ Slash komutları bu sunucuya yüklendi (${body.length} komut): ${gid}`);
      }
      /**
       * GUILD_ID varken aynı komutları global’e de yazmak Discord’da /komutların çift görünmesine yol açar.
       * Yalnız sunucu komutları: global listeyi boşalt.
       */
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log(
        '✓ Global slash komutları temizlendi (çift kayıt yok). Bu bot şu an yalnızca yukarıdaki sunucu ID’leri için komut kullanır.'
      );
      console.log(
        '\nNot: Botu başka sunuculara da aynı uygulama ile eklediysen — o sunucunun ID’sini GUILD_IDS’e yazıp bu scripti tekrar çalıştır. Sadece global istiyorsan env’den GUILD_ID / GUILD_IDS kaldır ve yeniden deploy et.'
      );
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body });
      console.log(`✓ Slash komutları global yüklendi (${body.length} komut).`);
      console.log('\nNot: Global komutların Discord’da görünmesi birkaç dakika ile ~1 saat arası sürebilir.');
      console.log('İpucu: env.json veya .env içine GUILD_ID ekleyip bu scripti tekrar çalıştırırsan o sunucuda komutlar anında görünür.');
    }
    console.log('\n→ Davet linkinde mutlaka şu scope olmalı: bot + applications.commands');
    console.log('→ Komutlar hâlâ yoksa: Bu scripti (npm run deploy-commands) token/client sonrası mutlaka çalıştır.');
    console.log('→ /start çalışmıyorsa: Sunucuda "Sunucuyu Yönet" yetkisi ve komutların yüklendiği sunucuda olduğundan emin ol.');
    console.log('→ Diğer komutlar için önce /start yapılmış olmalı (kurulum kaydı).');
  } catch (e) {
    console.error('Slash kayıt hatası:', e.message || e);
    if (e.code === 50001) {
      console.error('(Bota uygulama komutları ekleme izni yok — token doğru uygulamaya mı ait?)');
    }
    if (!String(process.env.CLIENT_ID || process.env.APPLICATION_ID || '').trim()) {
      console.error(
        '\nCLIENT_ID yokken token ile uygulama okunamadıysa: Developer Portal → Uygulama → Genel Bilgiler → Uygulama Kimliği → env.json / .env'
      );
    }
    process.exit(1);
  }
})();
