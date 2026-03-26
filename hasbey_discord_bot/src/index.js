const path = require('path');
const { ROOT } = require('./lib/paths');
const { loadProjectEnv } = require('./lib/envJson');
loadProjectEnv(ROOT);
const fs = require('fs');
const { Client, Collection, Events, GatewayIntentBits, ActivityType } = require('discord.js');
const chalk = require('chalk');
const { handleInteraction } = require('./interactionRouter');
const { readGuildConfig } = require('./lib/storage');
const { tickAfk } = require('./services/afk');
const { ensureBotData } = require('./services/tempVoice');
const { syncMemberCountChannel } = require('./services/channelStatus');
const { logError, logWarn, installProcessErrorLogging } = require('./lib/botLogger');

installProcessErrorLogging();

const token = process.env.DISCORD_TOKEN;
const RUNTIME_PATH = path.join(__dirname, '..', 'data', 'runtime.json');
const PROFILE_PATCH_PATH = path.join(__dirname, '..', 'data', 'profile-patch.json');
const PROFILE_USERNAME_COOLDOWN_PATH = path.join(__dirname, '..', 'data', 'profile-username-cooldown.json');

function writeDiscordReadyState(c) {
  fs.mkdirSync(path.dirname(RUNTIME_PATH), { recursive: true });
  fs.writeFileSync(
    RUNTIME_PATH,
    JSON.stringify({
      discord: true,
      at: new Date().toISOString(),
      tag: c.user.tag,
      applicationId: c.user.id,
      guilds: [...c.guilds.cache.values()].map((g) => ({ id: g.id, name: g.name })),
    }),
    'utf8'
  );
}

function clearRuntimeFile() {
  try {
    fs.unlinkSync(RUNTIME_PATH);
  } catch {
    /* yoksa sorun değil */
  }
}

if (!token) {
  console.error(chalk.red('DISCORD_TOKEN tanımlı değil (env.json, .env veya ortam değişkeni).'));
  process.exit(1);
}

// TR portal: Uygulama → Bot → "Ayrıcalıklı Ağ Geçidi Niyetleri" (Privileged Gateway Intents).
// Zorunlu ekrandaki: SERVER MEMBERS INTENT, MESSAGE CONTENT INTENT. İsteğe bağlı: PRESENCE INTENT + env DISCORD_ENABLE_PRESENCE_INTENT=1
function envFlag(name) {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] ?? '').trim());
}

const enablePresenceIntent = envFlag('DISCORD_ENABLE_PRESENCE_INTENT');

const gatewayIntents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
];
if (enablePresenceIntent) gatewayIntents.push(GatewayIntentBits.GuildPresences);

const client = new Client({ intents: gatewayIntents });

ensureBotData(client);

const commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd?.data?.name) commands.set(cmd.data.name, cmd);
}

/* Discord bot kullanıcı adı çok sıkı; çoklu süreç / yeniden başlatmada tekrar vurmasın diye süre uzun + disk */
const USERNAME_CHANGE_COOLDOWN_MS = 2 * 60 * 60 * 1000;

function readUsernameCooldownUntil() {
  try {
    const raw = fs.readFileSync(PROFILE_USERNAME_COOLDOWN_PATH, 'utf8');
    const j = JSON.parse(raw);
    const t = new Date(j.until).getTime();
    if (Number.isFinite(t) && t > Date.now()) return t;
  } catch {
    /* */
  }
  return 0;
}

function writeUsernameCooldownUntil(untilMs) {
  try {
    fs.mkdirSync(path.dirname(PROFILE_USERNAME_COOLDOWN_PATH), { recursive: true });
    fs.writeFileSync(
      PROFILE_USERNAME_COOLDOWN_PATH,
      JSON.stringify({ until: new Date(untilMs).toISOString() }, null, 2),
      'utf8'
    );
  } catch {
    /* */
  }
}

function clearUsernameCooldownFile() {
  try {
    fs.unlinkSync(PROFILE_USERNAME_COOLDOWN_PATH);
  } catch {
    /* */
  }
}

function isDiscordUsernameRateLimit(err) {
  const msg = err?.message || '';
  if (msg.includes('USERNAME_RATE_LIMIT')) return true;
  if (err?.code !== 50035) return false;
  try {
    const list = err.rawError?.errors?.username?._errors;
    return Array.isArray(list) && list.some((x) => x?.code === 'USERNAME_RATE_LIMIT');
  } catch {
    return false;
  }
}

/** Menü [4] Bot görünümü: patch dosyası; silme yalnızca Discord tarafı başarılı olunca (veya kısmi başarıda kalan alan yeniden yazılır) */
function startProfilePatchPoller() {
  if (client._profilePatchPollerOn) return;
  client._profilePatchPollerOn = true;

  let busy = false;
  let usernameNextTryAt = 0;
  setInterval(async () => {
    if (busy || !fs.existsSync(PROFILE_PATCH_PATH)) return;

    usernameNextTryAt = Math.max(usernameNextTryAt, readUsernameCooldownUntil());
    let patch;
    try {
      patch = JSON.parse(fs.readFileSync(PROFILE_PATCH_PATH, 'utf8'));
    } catch (e) {
      logError('[profil] patch okuma/JSON', e);
      console.warn(chalk.red('❌ [profil] patch okunamadı:', e.message));
      try {
        fs.unlinkSync(PROFILE_PATCH_PATH);
      } catch {
        /* */
      }
      return;
    }
    const remaining = {};
    const u = patch.username != null ? String(patch.username).trim() : '';
    if (u) remaining.username = u.slice(0, 32);
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
      remaining.description =
        patch.description == null ? '' : String(patch.description).trim().slice(0, 400);
    }
    if (!remaining.username && !Object.prototype.hasOwnProperty.call(remaining, 'description')) {
      try {
        fs.unlinkSync(PROFILE_PATCH_PATH);
      } catch {
        /* */
      }
      return;
    }

    busy = true;
    try {
      try {
        if (Object.prototype.hasOwnProperty.call(remaining, 'description')) {
          await client.application.fetch();
          await client.application.edit({ description: remaining.description });
          console.log(chalk.green('✅ [profil] Uygulama açıklaması güncellendi.'));
          delete remaining.description;
        }
      } catch (e) {
        logError('[profil] uygulama açıklaması (Discord API)', e);
        console.error(chalk.red('❌ [profil] Açıklama güncellenemedi:', e.message));
      }
      try {
        if (remaining.username) {
          if (Date.now() < usernameNextTryAt) {
            /* Hız sınırı bekleniyor — setUsername çağrılmıyor */
          } else {
            await client.user.setUsername(remaining.username);
            console.log(chalk.green('✅ [profil] Bot kullanıcı adı güncellendi.'));
            delete remaining.username;
            usernameNextTryAt = 0;
            clearUsernameCooldownFile();
          }
        }
      } catch (e) {
        if (isDiscordUsernameRateLimit(e)) {
          usernameNextTryAt = Date.now() + USERNAME_CHANGE_COOLDOWN_MS;
          writeUsernameCooldownUntil(usernameNextTryAt);
          const waitHr = USERNAME_CHANGE_COOLDOWN_MS / 3600000;
          logWarn(
            '[profil] kullanıcı adı',
            `hız sınırı (Discord); sonraki deneme ${new Date(usernameNextTryAt).toISOString()} (~${waitHr} saat)`
          );
          console.warn(
            chalk.yellow(
              `⚠️ [profil] Kullanıcı adı Discord limiti. ~${waitHr} saat boyunca tekrar istek yok (tüm bot süreçleri için data/profile-username-cooldown.json). İki kez bot çalıştırmayın.`
            )
          );
        } else {
          logError('[profil] bot kullanıcı adı (Discord API)', e);
          console.error(chalk.red('❌ [profil] Kullanıcı adı güncellenemedi:', e.message));
        }
      }

      const keysLeft = Object.keys(remaining);
      if (keysLeft.length) {
        fs.mkdirSync(path.dirname(PROFILE_PATCH_PATH), { recursive: true });
        fs.writeFileSync(PROFILE_PATCH_PATH, JSON.stringify(remaining, null, 2), 'utf8');
        const onlyUsernameInCooldown =
          keysLeft.length === 1 && remaining.username && Date.now() < usernameNextTryAt;
        if (!onlyUsernameInCooldown) {
          console.warn(
            chalk.yellow(
              '⚠️ [profil] Bazı alanlar uygulanamadı; data/profile-patch.json korunuyor (ayrıntı: logs/bot.log).'
            )
          );
        }
      } else {
        try {
          fs.unlinkSync(PROFILE_PATCH_PATH);
        } catch {
          /* */
        }
      }
    } finally {
      busy = false;
    }
  }, 2500);
}

client.once(Events.ClientReady, (c) => {
  writeDiscordReadyState(c);

  const n = c.guilds.cache.size;
  const names = [...c.guilds.cache.values()]
    .map((g) => g.name)
    .sort((a, b) => a.localeCompare(b, 'tr'))
    .join(', ');
  const sunucuBlok =
    n === 0
      ? 'Hiç sunucuda değil — aşağıdaki linkle davet et.'
      : n === 1
        ? `Giriş yapılan sunucu: ${names}`
        : `Giriş yapılan sunucular (${n}): ${names}`;

  const guildLinesForMenu = [...c.guilds.cache.values()]
    .map((g) => `${g.name} = ${g.id}`)
    .join(', ');

  const menuReadyLayout = process.env.HASBEY_MENU_READY_LAYOUT === '1';

  if (menuReadyLayout) {
    /* Düz metin: menü süreci chalk.dim ile [Bot] ön eki basar */
    console.log(`🚀 Bot başlatıldı, ${sunucuBlok}`);
    console.log(`   🤖 Oturum açıldı: ${c.user.tag} (ID = ${c.user.id})`);
    if (n > 0) {
      console.log(`   👾 Sunucu ID'leri: ${guildLinesForMenu}`);
    }
    console.log(`   💡 Komutlar gözükmüyorsa: \`npm run deploy-commands\` çalıştır.`);
    console.log(
      `   💡 Davet URL şart: scope \`bot\` + \`applications.commands\`. /start için sunucuda "Sunucuyu Yönet"`
    );
  } else {
    console.log(chalk.green(`🚀 Bot başlatıldı, ${sunucuBlok}`));
    console.log(chalk.dim(`   🤖 Oturum açıldı: ${c.user.tag} (ID = ${c.user.id})`));
    const envAppId = String(process.env.CLIENT_ID || process.env.APPLICATION_ID || '').trim();
    if (!envAppId) {
      console.log(
        chalk.yellow(
          '   ⚠ CLIENT_ID / APPLICATION_ID yok (env.json veya .env içinde “Uygulama Kimliği”). Bot yine de çalışır; davet URL’si yazdırılamaz. Slash: `npm run deploy-commands` (token ile id okunur) veya env.json’a "CLIENT_ID": "..." ekleyin.'
        )
      );
    }
    if (n === 0) {
      console.log('');
      console.log(chalk.yellow.bold('⚠ Bu hesap şu an HİÇBİR sunucuda üye değil.'));
      console.log(chalk.yellow('   Çevrimiçi görünüp üye listesinde yoksan: token doğru uygulamaya ait değil veya sunucuya hiç eklenmedin.'));
      const cid = process.env.CLIENT_ID || process.env.APPLICATION_ID;
      if (cid) {
        const q = new URLSearchParams({
          client_id: cid,
          permissions: '8',
          scope: 'bot applications.commands',
        });
        console.log(
          chalk.cyan(`   Davet (Yönetici izni): https://discord.com/api/oauth2/authorize?${q.toString()}`)
        );
        console.log(chalk.dim('   Daha az izin için: Developer Portal > OAuth2 > URL Generator.'));
      } else {
        console.log(chalk.dim('   Davet linki için yukarıdaki CLIENT_ID uyarısına uy.'));
      }
      console.log('');
    } else {
      console.log(chalk.dim(`   👾 Sunucu ID’leri: ${guildLinesForMenu}`));
    }
    console.log(
      chalk.yellow(`   💡 Komutlar gözükmüyorsa: \`npm run deploy-commands\` çalıştır.`)
    );
    console.log(
      chalk.yellow(
        `   💡 Davet URL şart: scope \`bot\` + \`applications.commands\`. /start için sunucuda "Sunucuyu Yönet"`
      )
    );
  }

  void Promise.resolve(
    c.user.setPresence({
      activities: [{ name: 'HasBEY', type: ActivityType.Playing }],
      status: 'online',
    })
  ).catch(() => {});

  startProfilePatchPoller();

  for (const g of c.guilds.cache.values()) {
    syncMemberCountChannel(c, g).catch(() => {});
  }

  setInterval(() => {
    for (const g of c.guilds.cache.values()) {
      const cfg = readGuildConfig(g.id);
      tickAfk(c, g, cfg).catch(() => {});
    }
  }, 60_000);
});

client.on(Events.GuildMemberAdd, (member) => {
  require('./events/guildMemberAdd')(member);
});

client.on(Events.GuildMemberRemove, (member) => {
  require('./events/guildMemberRemove')(member);
});

client.on(Events.VoiceStateUpdate, (oldS, newS) => {
  require('./events/voiceStateUpdate')(oldS, newS, client);
});

if (enablePresenceIntent) {
  client.on(Events.PresenceUpdate, (oldP, newP) => {
    require('./services/streamAnnounce').announceRichStreamIfNeeded(oldP, newP).catch(() => {});
  });
}

client.on(Events.MessageCreate, (m) => {
  require('./events/messageCreate')(m).catch(() => {});
});

client.on(Events.InteractionCreate, (i) => handleInteraction(i, commands));

client.on(Events.Warn, (m) => console.warn(chalk.yellow(m)));
client.on(Events.Error, (e) => {
  logError('discord.js Client#error', e);
  console.error(chalk.red(e));
});

client.on(Events.GuildCreate, (guild) => {
  console.log(chalk.green(`✓ Sunucuya eklendi: ${guild.name} (${guild.id})`));
});

client.on(Events.GuildDelete, (guild) => {
  console.log(chalk.yellow(`✗ Sunucudan çıkarıldı veya yok: ${guild.name} (${guild.id})`));
});

client.on(Events.ShardDisconnect, (event, shardId) => {
  const code = event?.code;
  console.warn(
    chalk.yellow(
      `[Shard ${shardId}] Discord ile bağlantı koptu (kod: ${code ?? '?'}). Yeniden bağlanma denenebilir.`
    )
  );
  if (code === 4014) {
    console.error(
      chalk.red(
        '4014 (izin verilmeyen niyet): discord.com/developers → Uygulaman → sol menü Bot → ' +
          '"Ayrıcalıklı Ağ Geçidi Niyetleri" bölümünde şu anahtarlar AÇIK olmalı: SERVER MEMBERS INTENT, MESSAGE CONTENT INTENT. ' +
          'Kodda durum niyeti açtıysanız ayrıca PRESENCE INTENT + env DISCORD_ENABLE_PRESENCE_INTENT=1.'
      )
    );
  }
});

function shutdown(reason) {
  clearRuntimeFile();
  client.destroy().catch(() => {});
  process.exit(reason ? 1 : 0);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

client.login(token).catch((e) => {
  logError('client.login', e);
  console.error(chalk.red(e));
  clearRuntimeFile();
  process.exit(1);
});
