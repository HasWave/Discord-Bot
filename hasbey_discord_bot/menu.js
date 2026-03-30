#!/usr/bin/env node
/**
 * HasBEY terminal menüsü — bot sürecini yönetir, env.json / .env ve yedeklere hızlı erişim.
 */
if (!process.env.NO_COLOR) {
  process.env.FORCE_COLOR = process.env.FORCE_COLOR ?? '1';
}

const { spawn, execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const {
  readGuildConfig,
  writeGuildConfig,
  defaultFeatures,
  defaultFeaturesAllOff,
  defaultGuildRecord,
  defaultCustomMessages,
} = require('./src/lib/storage');
const { LOG_FILE } = require('./src/lib/botLogger');
const { ROOT } = require('./src/lib/paths');
const {
  loadProjectEnv,
  getFromEnvJson,
  setEnvJsonKeyUpper,
  stripEnvJsonKeysUpper,
  envJsonPath,
  readEnvJsonObject,
  writeEnvJsonObject,
} = require('./src/lib/envJson');
const { TEMPLATE_GUEST_ROLE_NAME } = require('./src/services/defaultTemplate');

const BOT_JS = path.join(ROOT, 'bot.js');
const DEPLOY_COMMANDS_JS = path.join(ROOT, 'src', 'deploy-commands.js');
const ENV_PATH = path.join(ROOT, '.env');
loadProjectEnv(ROOT);

const BACKUPS_ROOT = path.join(ROOT, 'data', 'backups');
const RUNTIME_PATH = path.join(ROOT, 'data', 'runtime.json');
const PROFILE_PATCH_PATH = path.join(ROOT, 'data', 'profile-patch.json');
const FIXED_GUILD_BACKUP_FILE = 'sunucu-yedek.json';

const CHANNEL_FIELD_LIST = [
  ['slashCommandsChannelId', 'Bot Komut Kanalı ( /start Hariç )'],
  [
    'guestSlashCommandsChannelId',
    'Misafir bot + hoş geldin kanalı (Misafir rolüne görünür; slash / karşılama)',
  ],
  ['lastRegisteredDisplayChannelId', 'Son Kayıt Kanalı  (「👤」 + Null )'],
  ['memberCountChannelId', 'Üye Sayısı Kanalı (「👤」 : Null )'],
  ['lobbyVoiceId', 'Özel Oda Kanalı ( 🗝️ ʙᴀɴᴀ ᴛɪᴋʟᴀ )'],
  ['tempCategoryId', 'Kişisel Oda Kategorisi'],
  ['araCommandChannelId', 'Oyuncu Arama Kanalı'],
  ['araNotifyChannelId', 'Oyuncu Arama Bildirim Kanalı'],
  ['streamAnnounceChannelId', 'Yayın Duyuru Kanalı'],
  ['afkVoiceId', 'AFK Ses Kanalı'],
  [
    'registrationLogChannelId',
    'Yeni kayıtlar log kanalı (isim, yaş, takma ad, Discord adı — boşsa hoş geldin kanalı)',
  ],
  ['playerCategoryId', 'Oyun Kategorisi (Ekip Araması: Ses Bu Kategoride Olmalı)'],
];

/** cfg.roles — Discord Ayarları [5] */
const ROLE_FIELD_LIST = [
  [
    'guestRoleId',
    'Misafir rol ID (şablon/kurulum sonrası otomatik; boşsa env DEFAULT_GUEST_ROLE_ID veya rol adı)',
  ],
  ['memberRoleId', 'Kayıtlı rol ID (/kaydol, geçici oda — boşsa rol adıyla çözülür)'],
];

const FEATURE_LABELS = {
  welcomeOnJoin: 'Yeni Üye Hoş geldin Mesajı',
  registrationLog: 'Yeni Kayıt Log Tutma',
  registrationNickAgeFormat: 'Kayıtta Kullanıcı Ad Değiştirme',
  memberCountChannel: 'Üye Sayısı Kanal Adı Güncelleme',
  lastRegisteredDisplay: 'Son Kayıt Adını Kanal Adında Göster',
  tempVoiceFromLobby: 'Özel Oda Kişisel Ses Kanalı Açma',
  streamGoLiveAnnounce: 'Yayın duyuru: ses kanalında Go Live açılınca',
  streamRichAnnounce: 'Yayın duyuru: durumda Twitch vb.',
  afkMover: 'Süresi Dolunca AFK Ses Kanalına Taşıma',
  triggerReplies: 'Tetikleyici Yanıtlar',
  wordFilter: 'Kelime Filtresi (sil + uyar)',
  guestSlashRegisterReminder:
    'Misafir bot komut kanalı: kayıt hatırlatması (varsayılan: özelden 1 kez; isteğe kanal + süre)',
};

/** Soru beklerken bot satırlarını biriktir (Seçim: ile log karışmasın) */
const botLogQueue = [];
let menuWaitingInput = false;
/** Menü başlatma: bot stdout özetten sonra gri [Bot] satırları */
let botStartupCaptureActive = false;
let botStartupOutBuffer = '';

let botChild = null;
let shuttingDown = false;
let restartPending = false;
/** Bot başlatma sonrası ana menüye dönünce ekranı silip banner + menü yeniden */
let redrawMainMenuWithBanner = false;
let menuSessionBotEverStarted = false;
/** countdownToMainMenu: Enter beklemek için readline (Seri GitHub aracı ile aynı UX) */
let menuRl = null;

const BANNER_RAW = [
  '██╗░░██╗░█████╗░░██████╗██████╗░███████╗██╗░░░██╗',
  '██║░░██║██╔══██╗██╔════╝██╔══██╗██╔════╝╚██╗░██╔╝',
  '███████║███████║╚█████╗░██████╦╝█████╗░░░╚████╔╝░',
  '██╔══██║██╔══██║░╚═══██╗██╔══██╗██╔══╝░░░░╚██╔╝░░',
  '██║░░██║██║░░██║██████╔╝██████╦╝███████╗░░░██║░░░',
  '╚═╝░░╚═╝╚═╝░░╚═╝╚═════╝░╚═════╝░╚══════╝░░░╚═╝░░░',
];

const BANNER_WIDTH = Math.max(...BANNER_RAW.map((l) => l.length));
const BANNER_LINES = BANNER_RAW.map((l) => l.padEnd(BANNER_WIDTH, ' '));

const ANSI_GREEN = '\u001b[32m';
const ANSI_RESET = '\u001b[0m';

function menuRule() {
  return chalk.green('-'.repeat(BANNER_WIDTH));
}

/** Alt menü çerçevesi — başlık sabit genişlikte ortalanır (üst/alt çizgi ile aynı genişlik) */
const SUBMENU_BOX_INNER_W = 39;

function printSubmenuBox(title) {
  const bar = '+' + '-'.repeat(SUBMENU_BOX_INNER_W) + '+';
  const t = title.length > SUBMENU_BOX_INNER_W ? title.slice(0, SUBMENU_BOX_INNER_W) : title;
  const pad = SUBMENU_BOX_INNER_W - t.length;
  const l = Math.floor(pad / 2);
  const r = pad - l;
  const mid = '|' + ' '.repeat(l) + t + ' '.repeat(r) + '|';
  console.log(chalk.green('\n' + bar));
  console.log(chalk.green(mid));
  console.log(chalk.green(bar + '\n'));
}

function printSubtitleCentered() {
  const left = '[ Discord Bot Menu ';
  const mid = 'V1.0';
  const right = ' ]';
  const pad = BANNER_WIDTH - (left + mid + right).length;
  const lpad = Math.max(0, Math.floor(pad / 2));
  const line =
    ' '.repeat(lpad) +
    chalk.white(left) +
    chalk.red.bold(mid) +
    chalk.white(right);
  console.log(line);
}

function printBannerBlock() {
  console.log('');
  console.log(menuRule());
  console.log('');
  for (const line of BANNER_LINES) {
    console.log(chalk.green.bold(line));
  }
  console.log('');
  printSubtitleCentered();
  console.log('');
  console.log(menuRule());
}

function clearConsole() {
  if (!process.stdout.isTTY) return;
  if (process.platform === 'win32') {
    try {
      execSync('cls', { stdio: 'inherit' });
    } catch {
      try {
        execSync('cmd.exe /c cls', { stdio: 'inherit' });
      } catch {
        /* */
      }
    }
  } else {
    try {
      process.stdout.write('\x1b[3J\x1b[2J\x1b[H');
    } catch {
      /* */
    }
  }
  try {
    console.clear();
  } catch {
    /* */
  }
}

function clearRuntimeFile() {
  try {
    fs.unlinkSync(RUNTIME_PATH);
  } catch {
    /* */
  }
}

function readRuntimeState() {
  try {
    const raw = fs.readFileSync(RUNTIME_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Menü ve alt süreç ile aynı token mantığı (env.json → process.env → .env satırı) */
function readResolvedDiscordToken() {
  let v = String(process.env.DISCORD_TOKEN || '').trim().replace(/^["']|["']$/g, '').trim();
  if (v.length > 8) return v;

  v = getFromEnvJson(ROOT, 'DISCORD_TOKEN')
    .replace(/^["']|["']$/g, '')
    .trim();
  if (v.length > 8) return v;

  if (!fs.existsSync(ENV_PATH)) return '';
  let raw = fs.readFileSync(ENV_PATH, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const m = raw.match(/^\s*DISCORD_TOKEN\s*=\s*(.+)$/m);
  if (!m) return '';
  v = m[1].trim();
  const hash = v.search(/\s+#/);
  if (hash >= 0) v = v.slice(0, hash).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function readEnvKeyFromFile(key) {
  const fromJson = getFromEnvJson(ROOT, key);
  if (fromJson) return fromJson;
  if (!fs.existsSync(ENV_PATH)) return '';
  let raw = fs.readFileSync(ENV_PATH, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm');
  const m = raw.match(re);
  if (!m) return '';
  let v = m[1].trim();
  const hash = v.search(/\s+#/);
  if (hash >= 0) v = v.slice(0, hash).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function getEnvValueEffective(key) {
  if (key === 'DISCORD_TOKEN') return readResolvedDiscordToken();
  const fromFile = readEnvKeyFromFile(key);
  if (fromFile) return fromFile;
  return String(process.env[key] || '').trim();
}

/** Slash deploy / OAuth davet metni için (bot girişi için şart değil) */
function getApplicationIdEffective() {
  const a = String(getEnvValueEffective('CLIENT_ID') || '').trim();
  if (a) return a;
  return String(getEnvValueEffective('APPLICATION_ID') || '').trim();
}

function applicationIdConfigured() {
  const id = getApplicationIdEffective().replace(/^["']|["']$/g, '').trim();
  return id.length >= 15 && /^\d+$/.test(id);
}

/** env.json CLIENT_ID bozuksa (hex vb.) veya yoksa: bot girişinden doğru sayısal kimliği yazar */
function syncClientIdFromRuntimeIfNeeded() {
  let appId = '';
  try {
    const raw = fs.readFileSync(RUNTIME_PATH, 'utf8');
    const j = JSON.parse(raw);
    appId = String(j.applicationId || '').trim();
  } catch {
    return;
  }
  if (!/^\d{17,22}$/.test(appId)) return;

  const cur = String(getEnvValueEffective('CLIENT_ID') || '').trim();
  const curValid = /^\d{17,22}$/.test(cur);
  if (curValid) return;

  setEnvJsonKeyUpper(ROOT, 'CLIENT_ID', appId);
  console.log(
    chalk.dim(
      `ℹ CLIENT_ID geçerli değildi (sayısal Uygulama Kimliği olmalı); oturumdan düzeltildi: ${appId}`
    )
  );
}

function publicKeyConfigured() {
  const pk = String(getEnvValueEffective('DISCORD_PUBLIC_KEY') || '').trim();
  return pk.length >= 20;
}

function printConnectionStatusBlock(includeDiscord, discordOk) {
  if (includeDiscord) {
    console.log(
      discordOk
        ? chalk.green('Discord Bağlantısı : ✅ Başarılı')
        : chalk.red('Discord Bağlantısı : ❌ Başarısız')
    );
  }
  const tok = tokenFromEnvConfigured();
  console.log(
    tok ? chalk.green('Token Bağlantısı : ✅ Başarılı') : chalk.red('Token Bağlantısı : ❌ Başarısız')
  );
  console.log(
    applicationIdConfigured()
      ? chalk.green('Uygulama Kimliği  : ✅ Tanımlı')
      : chalk.yellow(
          'Uygulama Kimliği  : ⚠️ Eksik veya geçersiz — sadece sayı (Portal > Genel Bilgiler); [4]→[3] Uygulama ID'
        )
  );
  console.log(
    publicKeyConfigured()
      ? chalk.green('Açık Anahtar : ✅ Tanımlı')
      : chalk.dim('Açık Anahtar : — (isteğe bağlı, env.json DISCORD_PUBLIC_KEY)')
  );
  if (includeDiscord && discordOk) {
    try {
      const raw = fs.readFileSync(RUNTIME_PATH, 'utf8');
      const j = JSON.parse(raw);
      const aid = String(j.applicationId || '').trim();
      const gid = parseGuildIdFromEnv();
      if (aid && gid && aid === gid) {
        console.log(
          chalk.yellow(
            '⚠ GUILD_ID ile bot kimliği aynı — GUILD_ID sunucu ID olmalı (sunucu sağ tık). Bot / Uygulama Kimliği değil.'
          )
        );
      }
    } catch {
      /* */
    }
  }
}

/** Token ekranda tam yazılmasın */
function maskSecret(raw) {
  const s = String(raw);
  if (!s) return '(yok)';
  if (s.length <= 10) return `•••• (${s.length} karakter)`;
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} karakter)`;
}

function tokenFromEnvConfigured() {
  return readResolvedDiscordToken().length > 8;
}

function flushBotLogQueue() {
  if (!botLogQueue.length) return;
  for (const { stream, text } of botLogQueue) {
    if (stream === 'err') process.stderr.write(text);
    else process.stdout.write(text);
  }
  botLogQueue.length = 0;
}

function beginBotStartupCapture() {
  botStartupCaptureActive = true;
  botStartupOutBuffer = '';
}

function abortBotStartupCapture() {
  botStartupCaptureActive = false;
  botStartupOutBuffer = '';
}

/** Özet satırlarından sonra: düz metin satırları tek renkte gri [Bot] */
function flushBotStartupCaptureDim() {
  botStartupCaptureActive = false;
  const raw = botStartupOutBuffer;
  botStartupOutBuffer = '';
  if (!raw.trim()) return;
  const normalized = raw.replace(/\r\n/g, '\n');
  for (const line of normalized.split('\n')) {
    if (line.length) console.log(chalk.dim('[Bot] ' + line));
  }
}

/** Bağlantı başarılı: [Bot] 🚀 yeşil → durum kutusu → kalan [Bot] satırları gri */
function flushBotStartupCaptureSuccessLayout() {
  botStartupCaptureActive = false;
  const raw = botStartupOutBuffer;
  botStartupOutBuffer = '';
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (lines.length > 0) {
    console.log(chalk.green('[Bot] ' + lines[0]));
    console.log('');
  }

  printConnectionStatusBlock(true, true);
  console.log('');

  for (let i = 1; i < lines.length; i++) {
    console.log(chalk.dim('[Bot] ' + lines[i]));
  }
}

function logBot(chunk, stream) {
  const s = chunk.toString();
  if (stream === 'out' && botStartupCaptureActive) {
    botStartupOutBuffer += s;
    return;
  }
  const prefix = stream === 'err' ? '[Bot ERR] ' : '[Bot] ';
  const text = s.split('\n').map((line) => (line ? prefix + line : line)).join('\n');
  if (menuWaitingInput) {
    botLogQueue.push({ stream, text });
  } else {
    if (stream === 'err') process.stderr.write(text);
    else process.stdout.write(text);
  }
}

function printStatusPanel() {
  const procOn = isBotRunning();

  console.log('');
  console.log(chalk.bold.white('📶 Bot Stats'));
  console.log('');
  if (procOn) {
    console.log(chalk.green('Bot : 🟢 AKTİF'));
  } else if (menuSessionBotEverStarted) {
    console.log(chalk.red('Bot : 🔴 Durduruldu'));
  } else {
    console.log(chalk.dim('Bot : ⚪ Başlatılmamış'));
  }
  console.log('');
}

/** readline bazen chalk’ı düz gösterir; prompt için doğrudan ANSI + chalk fallback */
function prompt(rl, label = 'Seçim') {
  const q = `${ANSI_GREEN}${label}${ANSI_RESET}: `;
  return question(rl, q);
}

function isBotRunning() {
  return botChild !== null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const DISCORD_READY_POLL_MS = 400;
const DISCORD_READY_TIMEOUT_MS = 120_000;

/** startBot sonrası: tam menü yerine durum + bağlantı bekleme + Enter ile ana menü */
async function afterBotStartSequence(isRestart = false) {
  clearConsole();
  console.log('');
  console.log(
    chalk.green(
      isRestart
        ? 'Bot yeniden başlatılıyor, Discord bağlantısı bekleniyor...'
        : 'Bot başlatıldı, Discord bağlantısı bekleniyor...'
    )
  );
  console.log('');

  const deadline = Date.now() + DISCORD_READY_TIMEOUT_MS;
  let discordOk = false;
  while (Date.now() < deadline) {
    if (!isBotRunning()) {
      console.log('');
      flushBotStartupCaptureDim();
      console.log(chalk.red('Discord Bağlantısı : ❌ Başarısız (bot süreci kapandı)\n'));
      await countdownToMainMenu('❌ Bot süreci kapandı.', 'error');
      return;
    }
    const rt = readRuntimeState();
    if (rt && rt.discord === true) {
      discordOk = true;
      break;
    }
    await sleep(DISCORD_READY_POLL_MS);
  }

  if (discordOk) {
    console.log('');
    syncClientIdFromRuntimeIfNeeded();
    flushBotStartupCaptureSuccessLayout();
    runDeployCommandsAuto();
    console.log('');
    await countdownToMainMenu(
      isRestart ? '✅ Bot yeniden aktif.' : '✅ Bot Aktif.',
      'success'
    );
  } else {
    console.log('');
    flushBotStartupCaptureDim();
    console.log(
      chalk.red('Discord Bağlantısı : ❌ Başarısız (zaman aşımı — token/intent kontrol edin)\n')
    );
    await countdownToMainMenu('❌ Discord bağlantısı zaman aşımı.', 'error');
  }
}

/** Durum özeti + Enter; ardından ana menü taze çizilir (otomatik süre yok) */
async function countdownToMainMenu(line, tone = 'info') {
  console.log('');
  if (tone === 'success') {
    console.log(chalk.green(line));
  } else if (tone === 'error') {
    console.log(chalk.red(line));
  } else if (tone === 'warn') {
    console.log(chalk.yellow(line));
  } else {
    console.log(chalk.blue(line));
  }
  console.log('');
  const enterPrompt = chalk.dim('⏎ Ana menüye geçmek için Enter… ');
  if (menuRl) {
    await question(menuRl, enterPrompt);
  } else {
    console.log(chalk.dim('⏎ Ana menüye geçmek için Enter… (readline yok, 3 sn)'));
    await sleep(3000);
  }
  clearConsole();
  redrawMainMenuWithBanner = true;
}

/** @returns {boolean} süreç başlatıldıysa true */
function startBot() {
  if (isBotRunning()) {
    return false;
  }
  if (!fs.existsSync(BOT_JS)) {
    console.error(chalk.red('bot.js bulunamadı.\n'));
    return false;
  }
  const token = readResolvedDiscordToken();
  if (!token || token.length < 24) {
    console.log(
      chalk.red(
        '❌ DISCORD_TOKEN geçersiz veya eksik. [4] Bot Ayarlarından ekleyin.\n'
      )
    );
    return false;
  }
  clearRuntimeFile();
  beginBotStartupCapture();
  botChild = spawn(process.execPath, [BOT_JS], {
    cwd: ROOT,
    env: {
      ...process.env,
      DISCORD_TOKEN: token,
      HASBEY_MENU_READY_LAYOUT: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  botChild.stdout.on('data', (d) => logBot(d, 'out'));
  botChild.stderr.on('data', (d) => logBot(d, 'err'));
  botChild.on('exit', (code, sig) => {
    botChild = null;
    clearRuntimeFile();
    if (restartPending) {
      restartPending = false;
      startBot();
      return;
    }
    if (shuttingDown) {
      shuttingDown = false;
      console.log(chalk.green('Bot durduruldu.\n'));
      return;
    }
    console.log(
      chalk.green(
        `\n[Menü] Bot süreci kapandı (kod: ${code ?? '?'}, sinyal: ${sig ?? '-'}).\n`
      )
    );
  });
  botChild.on('error', (e) => {
    abortBotStartupCapture();
    console.error(chalk.red('Bot başlatılamadı:'), e.message);
    botChild = null;
    clearRuntimeFile();
  });
  menuSessionBotEverStarted = true;
  return true;
}

async function stopBotFromMenu() {
  if (!isBotRunning()) {
    console.log(chalk.yellow('⚠️ Çalışan bot yok.\n'));
    await countdownToMainMenu('Ana menüye geçiliyor.', 'warn');
    return;
  }
  shuttingDown = true;
  const proc = botChild;
  await new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    proc.once('exit', done);
    proc.kill('SIGTERM');
    setTimeout(() => {
      try {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
      } catch (_) {
        /* ignore */
      }
    }, 4500);
    setTimeout(done, 8000);
  });
  await countdownToMainMenu('Bot durduruldu.', 'success');
}

async function stopBotSilently() {
  if (!isBotRunning()) return true;
  shuttingDown = true;
  const proc = botChild;
  await new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    proc.once('exit', done);
    proc.kill('SIGTERM');
    setTimeout(() => {
      try {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
      } catch {
        /* */
      }
    }, 4500);
    setTimeout(done, 8000);
  });
  return !isBotRunning();
}

async function ensureBotStoppedForReset(rl) {
  if (!isBotRunning()) return true;
  console.log(
    chalk.yellow(
      '⚠️ Bot şu an açık. Sıfırlamadan önce kapatılması gerekir.\n' +
        '   Şimdi otomatik durdurulsun mu? [E/H]'
    )
  );
  const ans = (await prompt(rl)).trim().toUpperCase();
  if (ans !== 'E' && ans !== 'EVET' && ans !== 'Y' && ans !== 'YES') {
    console.log(chalk.dim('İşlem iptal edildi.\n'));
    return false;
  }
  console.log(chalk.cyan('⏳ Bot durduruluyor...'));
  const stopped = await stopBotSilently();
  if (!stopped) {
    console.log(
      chalk.red(
        '❌ Bot kapatılamadı. Başka terminalde `node bot.js` çalışıyorsa onu da kapatıp tekrar deneyin.\n'
      )
    );
    return false;
  }
  console.log(chalk.green('✅ Bot durduruldu, sıfırlama devam ediyor.\n'));
  return true;
}

/** Bot çalışmıyorsa normal başlatma+ekran; çalışıyorsa eski süreç kapanana kadar bekle, sonra [1] ile aynı akış */
async function restartBotFromMenu() {
  if (!isBotRunning()) {
    if (startBot()) {
      await afterBotStartSequence();
    }
    return;
  }

  const proc = botChild;
  restartPending = true;
  shuttingDown = false;
  console.log(chalk.green('Yeniden başlatılıyor...\n'));

  await new Promise((resolve) => {
    const onProcExit = () => {
      proc.removeListener('exit', onProcExit);
      resolve();
    };
    proc.once('exit', onProcExit);
    proc.kill('SIGTERM');
    setTimeout(() => {
      try {
        if (proc.exitCode === null && proc.signalCode === null) {
          proc.kill('SIGKILL');
        }
      } catch (_) {
        /* */
      }
    }, 4500);
  });

  if (isBotRunning()) {
    await afterBotStartSequence(true);
  } else {
    console.log(
      chalk.red(
        'Yeniden başlatılamadı (süreç kapandı). Token veya [4] Bot Ayarlarını kontrol edin.\n'
      )
    );
    await countdownToMainMenu('❌ Yeniden başlatılamadı.', 'error');
  }
}

function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return '';
  return fs.readFileSync(ENV_PATH, 'utf8');
}

function writeEnvFile(content) {
  fs.writeFileSync(ENV_PATH, content, 'utf8');
}

function setEnvKey(key, value) {
  setEnvJsonKeyUpper(ROOT, key, String(value).trim());
  console.log(chalk.green(`✅ ${key} güncellendi (env.json).\n`));
}

/** Sert sıfırlama: env.json anahtarları + varsa .env satırları */
function stripEnvKeys(keys) {
  stripEnvJsonKeysUpper(ROOT, keys);
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  const next = lines.filter((line) => !keys.some((key) => new RegExp(`^\\s*${key}\\s*=`).test(line)));
  writeEnvFile(next.join('\n'));
}

/** Onay satırında görünmez karakter / harf varyantı / boşluk toleransı */
function normalizeHardResetConfirm(s) {
  return String(s || '')
    .trim()
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .toLocaleUpperCase('en-US');
}

function hardResetDataAndEnv() {
  stripEnvKeys(['DISCORD_TOKEN', 'GUILD_ID', 'CLIENT_ID', 'GUILD_IDS', 'APPLICATION_ID']);
  try {
    if (fs.existsSync(envJsonPath(ROOT))) fs.unlinkSync(envJsonPath(ROOT));
  } catch {
    /* */
  }
  const dataRoot = path.join(ROOT, 'data');
  if (fs.existsSync(dataRoot)) {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(ROOT, 'data', 'guilds'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'data', 'stats'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'data', 'backups'), { recursive: true });
  menuSessionBotEverStarted = false;
}

function softResetGuildConfig(guildId) {
  const base = defaultGuildRecord();
  writeGuildConfig(guildId, {
    ...base,
    setupComplete: false,
    botOwnerId: null,
    channels: {},
    features: defaultFeaturesAllOff(),
    customMessages: {
      ...defaultCustomMessages(),
      welcomeLines: [],
      triggerReplies: [],
    },
    roles: base.roles,
    timeouts: base.timeouts,
  });
}

async function purgeGuildRolesAndChannelsFromDiscord(guildId, options = {}) {
  const token = readResolvedDiscordToken();
  if (!token || token.length < 24) {
    throw new Error('DISCORD_TOKEN eksik/gecersiz');
  }
  if (!/^\d{10,30}$/.test(String(guildId || '').trim())) {
    throw new Error('GUILD_ID eksik/gecersiz');
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(token);
    const guild = await client.guilds.fetch(String(guildId));
    await guild.channels.fetch().catch(() => {});
    await guild.roles.fetch().catch(() => {});

    let deletedChannels = 0;
    let deletedRoles = 0;

    const channels = [...guild.channels.cache.values()];
    for (const ch of channels) {
      const ok = await ch.delete('HasBEY sifirlama').catch(() => null);
      if (ok) deletedChannels++;
    }

    const roles = [...guild.roles.cache.values()]
      .filter((r) => r.id !== guild.id && !r.managed && r.editable)
      .sort((a, b) => b.position - a.position);
    for (const role of roles) {
      const ok = await role.delete('HasBEY sifirlama').catch(() => null);
      if (ok) deletedRoles++;
    }

    let defaultChannelId = null;
    if (options.createDefaultChannel) {
      const ch = await guild.channels
        .create({
          name: 'default',
          type: ChannelType.GuildText,
          reason: 'HasBEY soft sifirlama sonrasi komut kanali',
        })
        .catch(() => null);
      defaultChannelId = ch?.id || null;
    }

    return { deletedChannels, deletedRoles, defaultChannelId };
  } finally {
    await client.destroy();
  }
}

function question(rl, q) {
  menuWaitingInput = true;
  return new Promise((resolve) => {
    rl.question(q, (ans) => {
      menuWaitingInput = false;
      flushBotLogQueue();
      resolve(ans);
    });
  });
}

function guildBackupFilePath(gid) {
  return path.join(BACKUPS_ROOT, String(gid), FIXED_GUILD_BACKUP_FILE);
}

/** Tek sabit yedek dosyası (/yedekle ile güncellenir) */
function readGuildBackupMeta(gid) {
  const fp = guildBackupFilePath(gid);
  if (!fs.existsSync(fp)) return null;
  try {
    const st = fs.statSync(fp);
    return { path: fp, mtime: st.mtime };
  } catch {
    return null;
  }
}

function parseGuildIdFromEnv() {
  const g = String(process.env.GUILD_ID || getFromEnvJson(ROOT, 'GUILD_ID')).trim();
  if (/^\d{10,30}$/.test(g)) return g;
  if (!fs.existsSync(ENV_PATH)) return null;
  const t = fs.readFileSync(ENV_PATH, 'utf8');
  const m = t.match(/^\s*GUILD_ID\s*=\s*["']?(\d{10,30})["']?/m);
  return m ? m[1] : null;
}

async function runSetupWizardCore(rl) {
  const tok = (await question(rl, `${ANSI_GREEN}Token${ANSI_RESET}: `))
    .trim()
    .replace(/^["']|["']$/g, '');
  if (tok.length < 24) {
    console.log(chalk.red('❌ Token çok kısa veya boş.\n'));
    return false;
  }
  setEnvKey('DISCORD_TOKEN', tok);
  console.log(chalk.green('✅ Basariyla Kaydedildi.\n'));

  const g = (await question(rl, `${ANSI_GREEN}Sunucu ID${ANSI_RESET}: `)).trim();
  if (!/^\d{10,30}$/.test(g)) {
    console.log(chalk.red('❌ Geçersiz GUILD_ID.\n'));
    return false;
  }
  setEnvKey('GUILD_ID', g);
  console.log(chalk.green('✅ Basariyla Kaydedildi.\n'));

  const cid = (
    await question(rl, `${ANSI_GREEN}Bot Uygulama ID (istege bagli, Enter = atla)${ANSI_RESET}: `)
  ).trim();
  if (cid) {
    if (!/^\d{10,30}$/.test(cid)) {
      console.log(chalk.yellow('⚠️ Bot Uygulama ID sayisal olmali; bu alan atlandi.\n'));
    } else {
    setEnvKey('CLIENT_ID', cid);
      console.log(chalk.green('✅ Basariyla Kaydedildi.\n'));
    }
  }

  const pubKey = (
    await question(rl, `${ANSI_GREEN}Bot Acik Anahtar (istege bagli, Enter = atla)${ANSI_RESET}: `)
  ).trim();
  if (pubKey) {
    setEnvKey('DISCORD_PUBLIC_KEY', pubKey);
    console.log(chalk.green('✅ Basariyla Kaydedildi.\n'));
  }

  console.log(chalk.white('Genel Gorunum -> OAuth2 > OAuth2 URL Olusturucu\'dan bot seciniz.'));
  console.log(chalk.white('Bot Izinleri -> Yonetici, Entegrasyon Turu -> Lonca Kur -> URL Kopyalama.\n'));
  console.log(chalk.white('Kopyaladiginiz URL ile Botu Sunucunuza Ekleyiniz.\n'));
  console.log(chalk.green('✅ Kurulum bilgileri kaydedildi.\n'));
  return true;
}

async function runSetupWizardIfNeeded(rl) {
  const tokenOk = tokenFromEnvConfigured();
  const gidOk = Boolean(parseGuildIdFromEnv());
  if (tokenOk && gidOk) {
    return;
  }

  console.log(chalk.cyan('\n╔══════════════════════════════════════╗'));
  console.log(chalk.cyan('║      HasBEY — Kurulum sihirbazı      ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════╝\n'));
  console.log(chalk.white('1 ) https://discord.com/developers/applications  Bot Olusturun.'));
  console.log(chalk.white('2 ) Genel Gorunum -> Bot -> Tokeni Sifirlayarak Token Aliniz.'));
  console.log(chalk.white('3 ) Aldiginiz Tokeni asagiya giriniz.\n'));
  console.log(chalk.white.bold('  Developer Portal (discord.com/developers) — Bot sekmesi:'));
  console.log(
    chalk.dim(
      '  • Herkese Acik Bot (Public Bot) -> Acik olmali\n' +
        '  • Mesaj Icerigi Amaci (MESSAGE CONTENT INTENT) -> Acik olmali\n'
    )
  );
  console.log(
    chalk.yellow(
      '⚠️ Token veya Discord Sunucu ID Eksik — Tamamlayin.'
    )
  );
  console.log(chalk.dim('  env.json / .env veya [4] Bot Ayarlari / [5] Discord Ayarlari.\n'));

  await runSetupWizardCore(rl);
}

async function submenuReset(rl) {
  printSubmenuBox('Bot Sıfırlama');
  console.log(chalk.white('[1] Soft'));
  console.log(chalk.dim('  Not: Token Bilgileriniz Korunur, Oda ve Roller Silinir.\n'));
  console.log(chalk.white('[2] Sert'));
  console.log(chalk.dim('  Not: Tum Veriler, Yedek ve Oda + Rolleriniz Silinir.\n'));
  console.log(chalk.white('[0] İptal'));
  const c = (await prompt(rl)).trim();
  if (c === '0') {
    console.log(chalk.dim('⚠️ İptal.\n'));
    return;
  }
  if (c === '1') {
    const gid = parseGuildIdFromEnv();
    if (!gid) {
      console.log(chalk.red('❌ GUILD_ID yok (env.json / .env).\n'));
      return;
    }
    console.log(
      chalk.yellow(`Onay: sunucu ${gid} soft sifirlanacak. Yazin: SOFT`)
    );
    const o = (await prompt(rl)).trim();
    if (normalizeHardResetConfirm(o) !== 'SOFT') {
      console.log(chalk.yellow('⚠️ Onay verilmedi; işlem yapılmadı.\n'));
      return;
    }
    if (!(await ensureBotStoppedForReset(rl))) {
      return;
    }
    console.log(chalk.cyan('⏳ Soft Sıfırlama Başlatıldı...\n'));
    console.log(chalk.dim('-> Odalar Siliniyor'));
    console.log(chalk.dim('-> Roller Siliniyor'));
    console.log(chalk.dim('-> Bot Ayarları Sıfırlanıyor\n'));
    let purgeInfo;
    try {
      purgeInfo = await purgeGuildRolesAndChannelsFromDiscord(gid, { createDefaultChannel: true });
    } catch (e) {
      console.log(chalk.red(`❌ Discord oda/rol silme hatasi: ${e.message}\n`));
      return;
    }
    console.log(chalk.cyan('   Local Bot Ayarları Sıfırlanıyor...'));
    softResetGuildConfig(gid);
    console.log(
      chalk.green(
        `✅ Yumuşak Sıfırlama Tamamlandı. Discord'da ${purgeInfo.deletedChannels} Kanal ve ${purgeInfo.deletedRoles} Rol Silindi. Token Bilgileri Korundu.\n`
      )
    );
    if (purgeInfo.defaultChannelId) {
      console.log(chalk.green(`✅ Komut Kullanımı İçin #default Kanalı Açıldı (<#${purgeInfo.defaultChannelId}>).\n`));
    } else {
      console.log(chalk.yellow('⚠️ #default Kanalı Açılamadı (İzin/Hiyerarşi Kontrol Edin).\n'));
    }
    console.log(chalk.green('✅ Soft Sıfırlama Tamamlandı.\n'));
    await countdownToMainMenu('✅ Soft Sıfırlama Tamamlandı.', 'success');
    return;
  }
  if (c === '2') {
    console.log(chalk.red('❌ Tum veriler ve yedekler silinir; Discord oda/rolleri silinir; token dahil env alanlari temizlenir.'));
    console.log(chalk.yellow('Onay için tam olarak yazın: SIFIRLA'));
    console.log(chalk.dim('  (küçük harf de kabul edilir; İngilizce I ile)\n'));
    const o = await question(rl, `${ANSI_GREEN}Onay${ANSI_RESET}: `);
    const hardResetOk = normalizeHardResetConfirm(o) === 'SIFIRLA';
    if (!hardResetOk) {
      console.log(chalk.yellow('⚠️ Onay metni eşleşmedi. İşlem yapılmadı.\n'));
      return;
    }
    if (!(await ensureBotStoppedForReset(rl))) {
      return;
    }
    const gid = parseGuildIdFromEnv();
    if (!gid) {
      console.log(chalk.red('❌ GUILD_ID yok (env.json / .env).\n'));
      return;
    }
    console.log(chalk.cyan('⏳ Sert Sıfırlama Başlatıldı...\n'));
    console.log(chalk.dim('-> Odalar Siliniyor'));
    console.log(chalk.dim('-> Roller Siliniyor'));
    console.log(chalk.dim('-> Token Verileri Siliniyor\n'));
    let purgeInfo;
    try {
      purgeInfo = await purgeGuildRolesAndChannelsFromDiscord(gid, { createDefaultChannel: true });
    } catch (e) {
      console.log(chalk.red(`❌ Discord oda/rol silme hatasi: ${e.message}\n`));
      return;
    }
    console.log(chalk.cyan('   Local veri, yedek ve env temizleniyor...'));
    try {
      hardResetDataAndEnv();
    } catch (e) {
      console.log(chalk.red(`❌ Silme hatası: ${e.message}\n`));
      return;
    }
    loadProjectEnv(ROOT);
    console.log(
      chalk.green(
        `✅ Sert sifirlama bitti. Discord'da ${purgeInfo.deletedChannels} kanal ve ${purgeInfo.deletedRoles} rol silindi; local veri/yedek/env temizlendi.\n`
      )
    );
    if (purgeInfo.defaultChannelId) {
      console.log(chalk.green(`✅ Komut kullanimi icin #default kanali acildi (<#${purgeInfo.defaultChannelId}>).\n`));
    } else {
      console.log(chalk.yellow('⚠️ #default kanali acilamadi (izin/hiyerarsi kontrol edin).\n'));
    }
    console.log(
      chalk.green('✅ Sıfırlama Başarılı, 3sn sonra Kurulum Sihirbazına yönlendirileceksiniz.\n')
    );
    await sleep(3000);
    await runSetupWizardIfNeeded(rl);
    return;
  }
  console.log(chalk.red('❌ Geçersiz seçim.\n'));
}

const MAX_TRIGGER_RULES = 40;

async function submenuTriggerReplies(rl, gid) {
  for (;;) {
    const cfg = readGuildConfig(gid);
    const base = cfg.customMessages || {};
    let rules = Array.isArray(base.triggerReplies)
      ? base.triggerReplies.map((r) => ({
          trigger: String(r.trigger ?? '').trim(),
          response: String(r.response ?? '').trim(),
        }))
      : [];

    console.log(chalk.green('\n+---------------------------------------+'));
    console.log(chalk.green('|   Tetikleyici yanıtlar (etki → tepki)   |'));
    console.log(chalk.green('+---------------------------------------+'));
    console.log(
      chalk.dim(
        '  Mesaj (trim) tetik ile birebir eşleşince yanıt (büyük/küçük harf yok). Yer tutucu: {mention} {username} {tag}. Aç/kapa: üst menüde bu eklenti.\n'
      )
    );
    if (!rules.length) {
      console.log(chalk.dim('  (liste boş — varsayılan kurallar config’te yoksa hiç yanıt yok)\n'));
    }
    rules.forEach((r, i) => {
      const line = `"${r.trigger}" → ${r.response.length > 48 ? `${r.response.slice(0, 48)}…` : r.response}`;
      console.log(`  ${chalk.yellow(`[${i + 1}]`)} ${line}`);
    });
    console.log(chalk.white('\n  [E] — Yeni kural (tetik + yanıt)'));
    if (rules.length) {
      console.log(chalk.white('  Liste numarası — kural seç (düzenle / sil)'));
    }
    console.log(chalk.white('  [C] — Tüm kuralları sil'));
    console.log(chalk.white('  [0] — Eklentiler menüsü\n'));
    const c = (await prompt(rl)).trim();
    if (c === '0') return;
    const up = c.toUpperCase();
    if (up === 'E') {
      if (rules.length >= MAX_TRIGGER_RULES) {
        console.log(chalk.yellow(`⚠️ En fazla ${MAX_TRIGGER_RULES} kural.\n`));
        continue;
      }
      const trig = (await question(rl, `${ANSI_GREEN}Tetik metin (tam eşleşme, örn: sa)${ANSI_RESET}: `)).trim();
      const resp = (await question(rl, `${ANSI_GREEN}Yanıt metni${ANSI_RESET}: `)).trim();
      if (!trig || !resp) {
        console.log(chalk.yellow('⚠️ Tetik ve yanıt boş olamaz.\n'));
        continue;
      }
      rules.push({ trigger: trig.slice(0, 80), response: resp.slice(0, 500) });
      cfg.customMessages = { ...base, triggerReplies: rules };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Kural eklendi.\n'));
      continue;
    }
    if (up === 'C') {
      cfg.customMessages = { ...base, triggerReplies: [] };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Tüm tetik kuralları silindi.\n'));
      continue;
    }
    const n = parseInt(c, 10);
    if (Number.isInteger(n) && n >= 1 && n <= rules.length) {
      for (;;) {
        const cur = rules[n - 1];
        const respPreview =
          cur.response.length > 60 ? `${cur.response.slice(0, 60)}…` : cur.response;
        console.log(chalk.cyan(`\n  Kural [${n}]: "${cur.trigger}" → ${respPreview}`));
        console.log(chalk.white('  [1] — Düzenle'));
        console.log(chalk.white('  [2] — Sil'));
        console.log(chalk.white('  [0] — Tetik listesine dön\n'));
        const sub = (await prompt(rl)).trim();
        if (sub === '0') break;
        if (sub === '1') {
          const trig = (
            await question(rl, `${ANSI_GREEN}Tetik [Enter = ${cur.trigger}]${ANSI_RESET}: `)
          ).trim();
          const resp = (
            await question(rl, `${ANSI_GREEN}Yanıt [Enter = aynı]${ANSI_RESET}: `)
          ).trim();
          rules[n - 1] = {
            trigger: (trig || cur.trigger).slice(0, 80),
            response: (resp || cur.response).slice(0, 500),
          };
          cfg.customMessages = { ...base, triggerReplies: rules };
          writeGuildConfig(gid, cfg);
          console.log(chalk.green('✅ Kural güncellendi.\n'));
          break;
        }
        if (sub === '2') {
          rules.splice(n - 1, 1);
          cfg.customMessages = { ...base, triggerReplies: rules };
          writeGuildConfig(gid, cfg);
          console.log(chalk.green('✅ Kural silindi.\n'));
          break;
        }
        console.log(chalk.red('❌ Geçersiz seçim.\n'));
      }
      continue;
    }
    console.log(chalk.red('❌ Geçersiz seçim.\n'));
  }
}

const MAX_LFG_SHORTCUTS = 25;

async function submenuLfgShortcuts(rl, gid) {
  for (;;) {
    const cfg = readGuildConfig(gid);
    const base = cfg.customMessages || {};
    const raw = base.lfgShortcuts;
    let rules = Array.isArray(raw) ? raw.map((r) => ({ trigger: r.trigger, game: r.game })) : [];

    console.log(chalk.green('\n+---------------------------------------+'));
    console.log(chalk.green('|   Ekip arama — ! kısayol → oyun adı    |'));
    console.log(chalk.green('+---------------------------------------+'));
    console.log(
      chalk.dim(
        '  Oyuncu arama metin kanalında `!teams` listeler. Her kısayol `!` ile başlamalı. Ses: OYUN kategorisi.\n'
      )
    );
    if (!rules.length) {
      console.log(chalk.dim('  (liste boş)\n'));
    }
    rules.forEach((r, i) => {
      const g = r.game.length > 40 ? `${r.game.slice(0, 40)}…` : r.game;
      console.log(`  ${chalk.yellow(`[${i + 1}]`)} ${r.trigger} → ${g}`);
    });
    console.log(chalk.white('\n  [E] — Yeni kısayol'));
    if (rules.length) {
      console.log(chalk.white('  Numara — düzenle / sil'));
    }
    console.log(chalk.white('  [C] — Tümünü sil'));
    console.log(chalk.white('  [0] — Eklentiler menüsü\n'));
    const c = (await prompt(rl)).trim();
    if (c === '0') return;
    const up = c.toUpperCase();
    if (up === 'E') {
      if (rules.length >= MAX_LFG_SHORTCUTS) {
        console.log(chalk.yellow(`⚠️ En fazla ${MAX_LFG_SHORTCUTS} kısayol.\n`));
        continue;
      }
      const trigRaw = (await question(rl, `${ANSI_GREEN}Kısayol (örn !v)${ANSI_RESET}: `)).trim().toLowerCase();
      const game = (await question(rl, `${ANSI_GREEN}Oyun adı (duyuruda görünür)${ANSI_RESET}: `)).trim();
      if (!trigRaw.startsWith('!') || trigRaw.length < 2) {
        console.log(chalk.yellow('⚠️ Kısayol `!` ile başlamalı (örn !valorant).\n'));
        continue;
      }
      if (!game) {
        console.log(chalk.yellow('⚠️ Oyun adı boş olamaz.\n'));
        continue;
      }
      if (trigRaw === '!teams') {
        console.log(chalk.yellow('⚠️ `!teams` rezerve; başka kısayol seçin.\n'));
        continue;
      }
      if (rules.some((r) => r.trigger === trigRaw)) {
        console.log(chalk.yellow('⚠️ Bu kısayol zaten var.\n'));
        continue;
      }
      rules.push({ trigger: trigRaw.slice(0, 32), game: game.slice(0, 80) });
      cfg.customMessages = { ...base, lfgShortcuts: rules };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Kısayol eklendi.\n'));
      continue;
    }
    if (up === 'C') {
      cfg.customMessages = { ...base, lfgShortcuts: [] };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Tüm ekip arama kısayolları silindi.\n'));
      continue;
    }
    const n = parseInt(c, 10);
    if (Number.isInteger(n) && n >= 1 && n <= rules.length) {
      for (;;) {
        const cur = rules[n - 1];
        console.log(chalk.cyan(`\n  Kısayol [${n}]: ${cur.trigger} → ${cur.game}`));
        console.log(chalk.white('  [1] — Düzenle'));
        console.log(chalk.white('  [2] — Sil'));
        console.log(chalk.white('  [0] — Listeye dön\n'));
        const sub = (await prompt(rl)).trim();
        if (sub === '0') break;
        if (sub === '1') {
          const trigRaw = (
            await question(rl, `${ANSI_GREEN}Kısayol [Enter = ${cur.trigger}]${ANSI_RESET}: `)
          )
            .trim()
            .toLowerCase();
          const game = (
            await question(rl, `${ANSI_GREEN}Oyun [Enter = aynı]${ANSI_RESET}: `)
          ).trim();
          const nextTrig = (trigRaw || cur.trigger).slice(0, 32);
          if (!nextTrig.startsWith('!') || nextTrig.length < 2) {
            console.log(chalk.yellow('⚠️ Geçersiz kısayol.\n'));
            continue;
          }
          if (nextTrig === '!teams') {
            console.log(chalk.yellow('⚠️ `!teams` rezerve.\n'));
            continue;
          }
          const nextGame = (game || cur.game).slice(0, 80);
          if (!nextGame) {
            console.log(chalk.yellow('⚠️ Oyun adı boş olamaz.\n'));
            continue;
          }
          if (rules.some((r, i) => i !== n - 1 && r.trigger === nextTrig)) {
            console.log(chalk.yellow('⚠️ Bu kısayol başka satırda var.\n'));
            continue;
          }
          rules[n - 1] = { trigger: nextTrig, game: nextGame };
          cfg.customMessages = { ...base, lfgShortcuts: rules };
          writeGuildConfig(gid, cfg);
          console.log(chalk.green('✅ Güncellendi.\n'));
          break;
        }
        if (sub === '2') {
          rules.splice(n - 1, 1);
          cfg.customMessages = { ...base, lfgShortcuts: rules };
          writeGuildConfig(gid, cfg);
          console.log(chalk.green('✅ Silindi.\n'));
          break;
        }
        console.log(chalk.red('❌ Geçersiz seçim.\n'));
      }
      continue;
    }
    console.log(chalk.red('❌ Geçersiz seçim.\n'));
  }
}

async function submenuWelcomeMessages(rl, gid) {
  for (;;) {
    const cfg = readGuildConfig(gid);
    const base = cfg.customMessages || {};
    const lines = Array.isArray(base.welcomeLines) ? [...base.welcomeLines.map(String)] : [];

    console.log(chalk.green('\n+---------------------------------------+'));
    console.log(chalk.green('|   Hoş geldin — özel metin satırları    |'));
    console.log(chalk.green('+---------------------------------------+'));
    console.log(chalk.dim('  Yer tutucular: {member} {username} {tag}\n'));
    if (!lines.length) {
      console.log(chalk.dim('  (liste boş → bot varsayılan hoş geldin metnini kullanır)\n'));
    }
    lines.forEach((t, i) => {
      const short = t.length > 76 ? `${t.slice(0, 76)}…` : t;
      console.log(`  ${chalk.yellow(`[${i + 1}]`)} ${short}`);
    });
    console.log(chalk.white('\n  [E] — Yeni satır ekle'));
    console.log(chalk.white('  [no] — Satır numarası ile sil'));
    console.log(chalk.white('  [C] — Tümünü sil (varsayıla dön)'));
    console.log(chalk.white('  [0] — Eklentiler menüsü\n'));
    const c = (await prompt(rl)).trim();
    if (c === '0') return;
    const up = c.toUpperCase();
    if (up === 'E') {
      const line = (await question(rl, `${ANSI_GREEN}Yeni satır${ANSI_RESET}: `)).trim();
      if (!line) {
        console.log(chalk.yellow('⚠️ Boş satır eklenmedi.\n'));
        continue;
      }
      lines.push(line.slice(0, 500));
      cfg.customMessages = { ...base, welcomeLines: lines };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Satır eklendi.\n'));
      continue;
    }
    if (up === 'C') {
      cfg.customMessages = { ...base, welcomeLines: [] };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Özel satırlar silindi; varsayılan metin kullanılacak.\n'));
      continue;
    }
    const n = parseInt(c, 10);
    if (Number.isInteger(n) && n >= 1 && n <= lines.length) {
      lines.splice(n - 1, 1);
      cfg.customMessages = { ...base, welcomeLines: lines };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Satır silindi.\n'));
      continue;
    }
    console.log(chalk.red('❌ Geçersiz seçim.\n'));
  }
}

async function submenuWelcomeVisual(rl, gid) {
  for (;;) {
    const cfg = readGuildConfig(gid);
    const base = cfg.customMessages || {};
    const card = {
      title: String(base.welcomeCard?.title || '👋 Hoş geldin'),
      imageUrl: String(base.welcomeCard?.imageUrl || ''),
      color: String(base.welcomeCard?.color || '#FEE75C'),
    };

    console.log(chalk.green('\n+---------------------------------------+'));
    console.log(chalk.green('|   Hoş geldin — görsel ayarlar          |'));
    console.log(chalk.green('+---------------------------------------+'));
    console.log(chalk.dim('  Title, renk ve görsel URL ayarlanır. Renk: #RRGGBB\n'));
    console.log(chalk.white(`  Başlık   : ${card.title || '(boş)'}`));
    console.log(chalk.white(`  Renk     : ${card.color || '#FEE75C'}`));
    console.log(chalk.white(`  Görsel   : ${card.imageUrl || '(yok)'}`));
    console.log(chalk.white('\n  [1] — Başlık güncelle'));
    console.log(chalk.white('  [2] — Renk güncelle (#RRGGBB)'));
    console.log(chalk.white('  [3] — Görsel URL güncelle'));
    console.log(chalk.white('  [4] — Görsel URL temizle'));
    console.log(chalk.white('  [0] — Eklentiler menüsü\n'));

    const c = (await prompt(rl)).trim();
    if (c === '0') return;

    if (c === '1') {
      const v = (await question(rl, `${ANSI_GREEN}Yeni başlık (Enter = atla)${ANSI_RESET}: `)).trim();
      if (!v) {
        console.log(chalk.yellow('⚠️ Başlık değişmedi.\n'));
        continue;
      }
      cfg.customMessages = { ...base, welcomeCard: { ...card, title: v.slice(0, 120) } };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Başlık güncellendi.\n'));
      continue;
    }

    if (c === '2') {
      const v = (await question(rl, `${ANSI_GREEN}Renk (#RRGGBB)${ANSI_RESET}: `)).trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
        console.log(chalk.red('❌ Geçersiz renk. Örnek: #5865F2\n'));
        continue;
      }
      cfg.customMessages = { ...base, welcomeCard: { ...card, color: v.toUpperCase() } };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Renk güncellendi.\n'));
      continue;
    }

    if (c === '3') {
      const v = (await question(rl, `${ANSI_GREEN}Görsel URL (https://...)${ANSI_RESET}: `)).trim();
      if (!/^https?:\/\//i.test(v)) {
        console.log(chalk.red('❌ Geçerli bir http/https URL girin.\n'));
        continue;
      }
      cfg.customMessages = { ...base, welcomeCard: { ...card, imageUrl: v.slice(0, 500) } };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Görsel URL kaydedildi.\n'));
      continue;
    }

    if (c === '4') {
      cfg.customMessages = { ...base, welcomeCard: { ...card, imageUrl: '' } };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Görsel URL temizlendi.\n'));
      continue;
    }

    console.log(chalk.red('❌ Geçersiz seçim.\n'));
  }
}

async function submenuWordFilter(rl, gid) {
  const MAX_BAD_WORDS = 200;
  for (;;) {
    const cfg = readGuildConfig(gid);
    const base = cfg.customMessages || {};
    const words = Array.isArray(base.badWords) ? base.badWords.map((x) => String(x).toLowerCase()) : [];

    console.log(chalk.green('\n+---------------------------------------+'));
    console.log(chalk.green('|   Kelime filtresi (sil + uyar)        |'));
    console.log(chalk.green('+---------------------------------------+'));
    console.log(chalk.dim('  Bot, listedeki kelime geçen mesajı siler ve kullanıcıyı uyarır.\n'));

    if (!words.length) console.log(chalk.dim('  (liste boş)\n'));
    words.forEach((w, i) => {
      console.log(`  ${chalk.yellow(`[${i + 1}]`)} ${w}`);
    });

    console.log(chalk.white('\n  [E] — Kelime ekle'));
    if (words.length) console.log(chalk.white('  [no] — Numara ile sil'));
    console.log(chalk.white('  [C] — Tümünü sil'));
    console.log(chalk.white('  [0] — Eklentiler menüsü\n'));

    const c = (await prompt(rl)).trim();
    if (c === '0') return;
    const up = c.toUpperCase();

    if (up === 'E') {
      if (words.length >= MAX_BAD_WORDS) {
        console.log(chalk.yellow(`⚠️ En fazla ${MAX_BAD_WORDS} kelime.\n`));
        continue;
      }
      const v = (
        await question(rl, `${ANSI_GREEN}Kelime (küçük harf, boşluksuz önerilir)${ANSI_RESET}: `)
      )
        .trim()
        .toLowerCase();
      if (!v) {
        console.log(chalk.yellow('⚠️ Boş kelime eklenmedi.\n'));
        continue;
      }
      if (words.includes(v)) {
        console.log(chalk.yellow('⚠️ Bu kelime zaten listede.\n'));
        continue;
      }
      words.push(v.slice(0, 64));
      cfg.customMessages = { ...base, badWords: words };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Kelime eklendi.\n'));
      continue;
    }

    if (up === 'C') {
      cfg.customMessages = { ...base, badWords: [] };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Kelime listesi temizlendi.\n'));
      continue;
    }

    const n = parseInt(c, 10);
    if (Number.isInteger(n) && n >= 1 && n <= words.length) {
      words.splice(n - 1, 1);
      cfg.customMessages = { ...base, badWords: words };
      writeGuildConfig(gid, cfg);
      console.log(chalk.green('✅ Kelime silindi.\n'));
      continue;
    }

    console.log(chalk.red('❌ Geçersiz seçim.\n'));
  }
}

async function submenuEditChannelIds(rl, gid) {
  const cfg = readGuildConfig(gid);
  for (const [field, label] of CHANNEL_FIELD_LIST) {
    const cur = cfg.channels[field] || '';
    console.log(chalk.cyan(`\n${label}`));
    console.log(chalk.dim(`Şu an: ${cur || '( Boş )'}`));
    const v = (await question(rl, `${ANSI_GREEN}Yeni ID (Enter = Atla, - = Sil)${ANSI_RESET}: `)).trim();
    if (v === '') continue;
    if (v === '-') {
      delete cfg.channels[field];
    } else if (/^\d{10,25}$/.test(v)) {
      cfg.channels[field] = v;
    } else {
      console.log(chalk.red('❌ Geçerli bir kanal/snowflake ID girin.\n'));
    }
  }
  writeGuildConfig(gid, cfg);
  console.log(chalk.green('✅ Sunucu kanal ID’leri kaydedildi.\n'));
}

async function submenuEditRoleIds(rl, gid) {
  loadProjectEnv(ROOT);
  const cfg = readGuildConfig(gid);
  cfg.roles = { ...defaultGuildRecord().roles, ...(cfg.roles || {}) };
  const envGuestHint = getFromEnvJson(ROOT, 'DEFAULT_GUEST_ROLE_ID');
  console.log(
    chalk.dim(
      '\n  Discord: Sunucu Ayarları → Roller → rolü sağ tık → Rol ID’sini Kopyala (Geliştirici modu açık olmalı).\n'
    )
  );
  for (const [field, label] of ROLE_FIELD_LIST) {
    const cur = cfg.roles[field];
    const curStr = cur != null && cur !== '' ? String(cur) : '';
    const emptyHint =
      field === 'guestRoleId'
        ? `( Boş — env DEFAULT_GUEST_ROLE_ID: ${envGuestHint || 'yok'}; yoksa "${cfg.roles.guestRoleName}" adıyla çözülür )`
        : '( Boş — "Kayıtlı" rol adıyla çözülür )';
    console.log(chalk.cyan(`\n${label}`));
    console.log(chalk.dim(`Şu an: ${curStr || emptyHint}`));
    const v = (await question(rl, `${ANSI_GREEN}Yeni rol ID (Enter = Atla, - = Sil)${ANSI_RESET}: `)).trim();
    if (v === '') continue;
    if (v === '-') {
      cfg.roles[field] = null;
    } else if (/^\d{10,25}$/.test(v)) {
      cfg.roles[field] = v;
    } else {
      console.log(chalk.red('❌ Geçerli bir rol snowflake ID girin.\n'));
    }
  }
  writeGuildConfig(gid, cfg);
  console.log(chalk.green('✅ Rol ID’leri kaydedildi.\n'));
}

async function submenuToggleFeatures(rl, gid) {
  for (;;) {
    const cfg = readGuildConfig(gid);
    cfg.features = { ...defaultFeatures(), ...cfg.features };
    const keys = Object.keys(defaultFeatures());
    const msgIdx = keys.length + 1;
    const trigIdx = keys.length + 2;
    const lfgIdx = keys.length + 3;
    const welcomeVisualIdx = keys.length + 4;
    const wordFilterIdx = keys.length + 5;
    console.log(chalk.green('\n+---------------------------------------+'));
    console.log(chalk.green('|            Eklentiler                 |'));
    console.log(chalk.green('+---------------------------------------+'));
    console.log(chalk.dim('  Numara ile aç/kapa · hoş geldin / tetik / ekip kısayolları ayrı menü\n'));
    keys.forEach((k, i) => {
      const on = cfg.features[k] !== false;
      console.log(
        `  ${chalk.yellow(`[${i + 1}]`)} ${FEATURE_LABELS[k] || k}: ${
          on ? chalk.green('🟢 AÇIK') : chalk.red('🔴 KAPALI')
        }`
      );
    });
    console.log(
      chalk.cyan(`  [${msgIdx}] Hoş geldin — özel metin satırları (ekle / sil)`)
    );
    console.log(
      chalk.cyan(`  [${trigIdx}] Tetikleyici yanıtlar — ekle / sil / düzenle (örn. sa → Aleyküm selam)`)
    );
    console.log(
      chalk.cyan(`  [${lfgIdx}] Ekip arama kısayolları — !v → Valorant gibi (oyuncu arama kanalı)`)
    );
    console.log(
      chalk.cyan(`  [${welcomeVisualIdx}] Hoş geldin görsel ayarları — başlık / renk / görsel URL`)
    );
    console.log(
      chalk.cyan(`  [${wordFilterIdx}] Kelime filtresi listesi — ekle / sil / temizle`)
    );
    console.log(chalk.dim('  [0] Üst menü\n'));
    const c = (await prompt(rl)).trim();
    if (c === '0') return;
    if (c === String(msgIdx)) {
      await submenuWelcomeMessages(rl, gid);
      continue;
    }
    if (c === String(trigIdx)) {
      await submenuTriggerReplies(rl, gid);
      continue;
    }
    if (c === String(lfgIdx)) {
      await submenuLfgShortcuts(rl, gid);
      continue;
    }
    if (c === String(welcomeVisualIdx)) {
      await submenuWelcomeVisual(rl, gid);
      continue;
    }
    if (c === String(wordFilterIdx)) {
      await submenuWordFilter(rl, gid);
      continue;
    }
    const n = parseInt(c, 10);
    if (!Number.isInteger(n) || n < 1 || n > keys.length) {
      console.log(chalk.red('❌ Geçersiz seçim.\n'));
      continue;
    }
    const key = keys[n - 1];
    const prev = cfg.features[key] !== false;
    cfg.features[key] = !prev;
    writeGuildConfig(gid, cfg);
    const label = FEATURE_LABELS[key] || key;
    if (!prev) {
      console.log(chalk.green(`✅ ${label} → AÇILDI\n`));
    } else {
      console.log(chalk.yellow(`⚠️ ${label} → KAPANDI\n`));
    }
  }
}

async function submenuGeneral(rl) {
  for (;;) {
    const gid = parseGuildIdFromEnv();
    printSubmenuBox('Discord Ayarları');
    if (gid) {
      console.log(chalk.dim(`  Sunucu ID: ${gid}\n`));
    } else {
      console.log(chalk.dim('  Sunucu ID: (tanımlı değil — [1] ile ekleyin)\n'));
    }
    console.log(chalk.white('[1] - Sunucu ID Ayarları'));
    console.log(chalk.white('[2] - Kanalları Ayarla'));
    console.log(chalk.white('[3] - Eklentiler'));
    console.log(chalk.white('[4] - Özet (channels + features + roles)'));
    console.log(chalk.white('[5] - Rol ID'));
    console.log(chalk.white('[6] - AFK Süresi (dakika)'));
    console.log(
      chalk.white('[7] - Misafir kayıt hatırlatması: özelden 1 kez veya kanalda (süreli silinen mesaj)')
    );
    console.log(
      chalk.white('[8] - Varsayılan misafir rol ID (env.json — guild’de guestRoleId boşsa kullanılır)')
    );
    console.log(chalk.white(''));
    console.log(chalk.white('[0] - Ana Menü\n'));
    const c = (await prompt(rl)).trim();
    if (c === '0') return;
    if (c === '1') {
      await promptEnvKeyEdit(rl, 'GUILD_ID');
      continue;
    }
    const g = parseGuildIdFromEnv();
    if (!g) {
      console.log(
        chalk.red('❌ Önce [1] Sunucu ID Ayarları ile GUILD_ID ekleyin (env.json / .env).\n')
      );
      continue;
    }
    if (c === '2') {
      await submenuEditChannelIds(rl, g);
      continue;
    }
    if (c === '3') {
      await submenuToggleFeatures(rl, g);
      continue;
    }
    if (c === '4') {
      const cfg = readGuildConfig(g);
      cfg.features = { ...defaultFeatures(), ...cfg.features };
      console.log(chalk.cyan('\nroles:'));
      console.log(JSON.stringify(cfg.roles || {}, null, 2));
      console.log(chalk.cyan('\nchannels:'));
      console.log(JSON.stringify(cfg.channels, null, 2));
      console.log(chalk.cyan('\nfeatures:'));
      console.log(JSON.stringify(cfg.features, null, 2));
      console.log(chalk.cyan('\ncustomMessages (hoş geldin, filtre, tetik):'));
      console.log(JSON.stringify(cfg.customMessages || { welcomeLines: [] }, null, 2));
      console.log('');
      continue;
    }
    if (c === '5') {
      await submenuEditRoleIds(rl, g);
      continue;
    }
    if (c === '6') {
      const cfg = readGuildConfig(g);
      const cur = Number(cfg.timeouts?.afkMinutes ?? 30);
      console.log(chalk.cyan(`\nAFK suresi su an: ${cur} dk`));
      const v = (await question(rl, `${ANSI_GREEN}Yeni dakika (1-720)${ANSI_RESET}: `)).trim();
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1 || n > 720) {
        console.log(chalk.red('❌ Gecerli bir dakika girin (1-720).\n'));
        continue;
      }
      cfg.timeouts = { ...(cfg.timeouts || {}), afkMinutes: n };
      writeGuildConfig(g, cfg);
      console.log(chalk.green('✅ AFK suresi guncellendi.\n'));
      continue;
    }
    if (c === '7') {
      const cfg = readGuildConfig(g);
      const styleCur = cfg.timeouts?.guestRegisterReminderStyle === 'channel' ? 'channel' : 'dm_once';
      const rawMin = Number(cfg.timeouts?.guestRegisterReminderDeleteMinutes ?? 5);
      const minCur = rawMin === 10 || rawMin === 15 ? rawMin : 5;
      console.log(chalk.cyan('\nMisafir kayit hatirlatmasi'));
      console.log(
        chalk.dim(
          `Su an: ${styleCur === 'dm_once' ? 'Özelden 1 kez (kanal kirletilmez)' : `Kanalda, ${minCur} dk sonra silinen mesaj`}\n`
        )
      );
      console.log(chalk.dim('  [1] Özelden 1 kez (önerilen)'));
      console.log(chalk.dim('  [2] Kanalda hatırlat (mesaj süre sonunda silinir)\n'));
      const vStyle = (await question(rl, `${ANSI_GREEN}Secim (1-2)${ANSI_RESET}: `)).trim();
      if (vStyle === '1') {
        cfg.timeouts = { ...(cfg.timeouts || {}), guestRegisterReminderStyle: 'dm_once' };
        writeGuildConfig(g, cfg);
        console.log(chalk.green('✅ Hatırlatma: özel mesaj, kullanıcı başına yalnızca 1 kez.\n'));
        continue;
      }
      if (vStyle !== '2') {
        console.log(chalk.red('❌ 1 veya 2 girin.\n'));
        continue;
      }
      console.log(chalk.dim('  Kanal mesajı silinme süresi: [1] 5 dk   [2] 10 dk   [3] 15 dk\n'));
      const v = (await question(rl, `${ANSI_GREEN}Secim (1-3)${ANSI_RESET}: `)).trim();
      if (!['1', '2', '3'].includes(v)) {
        console.log(chalk.red('❌ 1, 2 veya 3 girin.\n'));
        continue;
      }
      const choice = v === '2' ? 10 : v === '3' ? 15 : 5;
      cfg.timeouts = {
        ...(cfg.timeouts || {}),
        guestRegisterReminderStyle: 'channel',
        guestRegisterReminderDeleteMinutes: choice,
      };
      writeGuildConfig(g, cfg);
      console.log(
        chalk.green(`✅ Hatırlatma: kanalda, mesaj ${choice} dk sonra silinir.\n`)
      );
      continue;
    }
    if (c === '8') {
      loadProjectEnv(ROOT);
      const cur = getFromEnvJson(ROOT, 'DEFAULT_GUEST_ROLE_ID');
      console.log(chalk.cyan('\nVarsayılan misafir rol ID (env.json)'));
      console.log(
        chalk.dim(
          'Guild JSON’da `guestRoleId` boşken bot bu snowflake’i kullanır. `/start` veya `/kur` ile şablon kurulduğunda gerçek rol ID’si dosyaya yazılır (öncelik guild’dedir).'
        )
      );
      console.log(chalk.dim(`Şablon misafir rol adı: ${TEMPLATE_GUEST_ROLE_NAME}`));
      console.log(chalk.dim(`Şu an env: ${cur || '(tanımlı değil)'}\n`));
      console.log(chalk.dim('Enter = atla   - = env anahtarını sil\n'));
      const v = (await question(rl, `${ANSI_GREEN}Yeni rol snowflake${ANSI_RESET}: `)).trim();
      if (v === '') continue;
      if (v === '-') {
        stripEnvJsonKeysUpper(ROOT, ['DEFAULT_GUEST_ROLE_ID']);
        const obj = readEnvJsonObject(ROOT);
        if ('defaultGuestRoleId' in obj) {
          delete obj.defaultGuestRoleId;
          writeEnvJsonObject(ROOT, obj);
        }
        delete process.env.DEFAULT_GUEST_ROLE_ID;
        console.log(chalk.green('✅ DEFAULT_GUEST_ROLE_ID kaldırıldı.\n'));
        continue;
      }
      if (!/^\d{10,25}$/.test(v)) {
        console.log(chalk.red('❌ Geçerli bir rol snowflake girin.\n'));
        continue;
      }
      setEnvJsonKeyUpper(ROOT, 'DEFAULT_GUEST_ROLE_ID', v);
      console.log(chalk.green('✅ env.json güncellendi. Çalışan bot süreci varsa yeniden başlatın.\n'));
      continue;
    }
    console.log(chalk.red('❌ Geçersiz seçim.\n'));
  }
}

async function submenuEnv(rl) {
  for (;;) {
    printSubmenuBox('Bot Ayarları');
    console.log(chalk.white('[1] - Discord Token'));
    console.log(chalk.white('[2] - Discord Sunucu ID'));
    console.log(chalk.white('[3] - Bot Uygulama ID'));
    console.log(chalk.white('[4] - Bot Açık Anahtar ID'));
    console.log(chalk.white('[5] - Bot Görünümü'));
    console.log(chalk.white(''));
    console.log(chalk.white('[0] Ana Menü\n'));
    const c = (await prompt(rl)).trim();
    if (c === '0') return;
    if (c === '1') {
      await promptEnvKeyEdit(rl, 'DISCORD_TOKEN');
      continue;
    }
    if (c === '2') {
      await promptEnvKeyEdit(rl, 'GUILD_ID');
      continue;
    }
    if (c === '3') {
      await promptEnvKeyEdit(rl, 'CLIENT_ID');
      continue;
    }
    if (c === '4') {
      await promptEnvKeyEdit(rl, 'DISCORD_PUBLIC_KEY');
      continue;
    }
    if (c === '5') {
      await submenuBotProfilePatch(rl);
      continue;
    }
    console.log(chalk.red('❌ Geçersiz seçim.\n'));
  }
}

async function submenuBotProfilePatch(rl) {
  console.log('');
  console.log(chalk.cyan('Discord’da görünen bot adı ve geliştirici portalındaki uygulama açıklaması.'));
  console.log(
    chalk.dim('İsim: Boş Enter = atla. Açıklama: Enter = atla, yalnızca 0 = boş (sıfırla).\n')
  );
  const username = (
    await question(rl, `${ANSI_GREEN}Yeni bot adı (Enter = Atla)${ANSI_RESET}: `)
  ).trim();
  const descriptionRaw = await question(
    rl,
    `${ANSI_GREEN}Uygulama açıklaması (Enter = Atla, 0 = Boş)${ANSI_RESET}: `
  );
  const descriptionTrim = descriptionRaw.trim();
  let descriptionSet = false;
  let descriptionValue = '';
  if (descriptionTrim === '') {
    /* Enter veya yalnızca boşluk = atla */
  } else if (descriptionTrim === '0') {
    descriptionSet = true;
    descriptionValue = '';
  } else {
    descriptionSet = true;
    descriptionValue = descriptionTrim.slice(0, 400);
  }

  const payload = {};
  if (username) payload.username = username.slice(0, 32);
  if (descriptionSet) payload.description = descriptionValue;

  if (Object.keys(payload).length === 0) {
    console.log(chalk.yellow('⚠️ Hiçbir alan doldurulmadı.\n'));
    return;
  }
  try {
    fs.mkdirSync(path.dirname(PROFILE_PATCH_PATH), { recursive: true });
    fs.writeFileSync(PROFILE_PATCH_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    console.log(chalk.red(`❌ Patch dosyası yazılamadı: ${e.message}\n`));
    return;
  }
  console.log(chalk.green('✅ Kaydedildi. Bot çalışıyorsa birkaç saniye içinde Discord tarafına uygulanır.'));
  console.log(chalk.dim(`  Patch: ${PROFILE_PATCH_PATH}`));
  console.log(chalk.dim(`  Hata kaydı: ${LOG_FILE}\n`));
}

async function promptEnvKeyEdit(rl, key) {
  const secret = key === 'DISCORD_TOKEN';
  const cur = getEnvValueEffective(key);

  console.log('');
  if (cur) {
    console.log(
      chalk.cyan(`Mevcut ${key}:`),
      chalk.white(secret ? maskSecret(cur) : cur)
    );
  } else {
    console.log(chalk.dim(`Mevcut ${key}: Tanımlı Değil`));
  }
  console.log(chalk.white('[1] Güncelle'));
  console.log(chalk.white('[0] İptal\n'));
  const sub = (await prompt(rl)).trim();
  if (sub === '0') {
    console.log(chalk.yellow('⚠️ İptal.\n'));
    return;
  }
  if (sub !== '1') {
    console.log(chalk.red('❌ Geçersiz seçim.\n'));
    return;
  }
  const val = (
    await question(rl, `${ANSI_GREEN}${key} — yeni değeri yapıştır${ANSI_RESET}: `)
  ).trim();
  if (!val) {
    console.log(chalk.yellow('⚠️ Boş bırakıldı, kaydedilmedi.\n'));
    return;
  }
  setEnvKey(key, val);
}

async function submenuBackup(rl) {
  const gid = parseGuildIdFromEnv();
  if (!gid) {
    console.log(chalk.red('GUILD_ID yok (env.json / .env). Önce [5] Discord Ayarları → [1] Sunucu ID.\n'));
    return;
  }
  for (;;) {
    const meta = readGuildBackupMeta(gid);
    console.log(chalk.green('\n+---------------------------------------+'));
    console.log(chalk.green('|               Yedekler                |'));
    console.log(chalk.green('+---------------------------------------+\n'));
    console.log(chalk.dim(`  Sunucu ID: ${gid}`));
    if (meta) {
      console.log(
        chalk.dim(`  Son Yedekleme: ${meta.mtime.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' })}`)
      );
      console.log(chalk.dim(`  Dosya: ${path.relative(ROOT, meta.path)}`));
    } else {
      console.log(chalk.dim('  Son Yedekleme: ( Mevcut Değil — Discord’da /yedekle kullanın)'));
    }
    console.log('');
    console.log(chalk.white('[1] - Yedek Kur'));
    console.log(chalk.white(''));
    console.log(chalk.white('[0] - Ana Menü\n'));
    const c = (await prompt(rl)).trim();
    if (c === '0') return;
    if (c === '1') {
      await promptRestoreFromBackup(rl, gid);
      continue;
    }
    console.log(chalk.red('Geçersiz seçim.\n'));
  }
}

async function promptRestoreFromBackup(rl, gid) {
  const fp = guildBackupFilePath(gid);
  if (!fs.existsSync(fp)) {
    console.log(chalk.yellow('Yedek dosyası yok. Önce sunucuda /yedekle çalıştırın.\n'));
    return;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    console.log(chalk.red('Yedek dosyası okunamadı veya bozuk.\n'));
    return;
  }
  if (!data.botConfig || typeof data.botConfig !== 'object') {
    console.log(
      chalk.yellow(
        'Bu yedek eski formatta (bot ayarı yok). Menüyle uyum için sunucuda tekrar /yedekle deneyin.\n'
      )
    );
    return;
  }
  console.log(chalk.yellow('Mevcut data/guilds ayarının üzerine yazılacak.'));
  console.log(chalk.white('[1] - Onayla ve yükle'));
  console.log(chalk.white('[0] - İptal\n'));
  const ok = (await prompt(rl)).trim();
  if (ok !== '1') {
    console.log(chalk.dim('İptal.\n'));
    return;
  }
  writeGuildConfig(gid, { ...data.botConfig });
  console.log(chalk.green('Bot ayarları yedekten yüklendi.\n'));
}

function runDeployCommandsFromMenu() {
  console.log(chalk.cyan('\nSlash komutları Discord’a kaydediliyor (deploy-commands)…\n'));
  const r = spawnSync(process.execPath, [DEPLOY_COMMANDS_JS], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.error) {
    console.log(chalk.red(`\nÇalıştırılamadı: ${r.error.message}\n`));
    return;
  }
  if (r.status === 0) {
    console.log(chalk.green('\nKomut yenileme tamamlandı.\n'));
  } else {
    console.log(chalk.red(`\nKomut yenileme başarısız (çıkış kodu: ${r.status}).\n`));
  }
}

function runDeployCommandsAuto() {
  console.log(chalk.cyan('\nSlash komutlari otomatik yenileniyor (deploy-commands)...\n'));
  const r = spawnSync(process.execPath, [DEPLOY_COMMANDS_JS], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.error) {
    console.log(chalk.red(`\nOtomatik komut yenileme calistirilamadi: ${r.error.message}\n`));
    return;
  }
  if (r.status === 0) {
    console.log(chalk.green('\nOtomatik komut yenileme tamamlandi.\n'));
  } else {
    console.log(chalk.red(`\nOtomatik komut yenileme basarisiz (cikis kodu: ${r.status}).\n`));
  }
}

function printMenuOptions() {
  console.log(menuRule());
  console.log('');
  console.log(chalk.white('[1] Botu Başlat'));
  console.log(chalk.white('[2] Yeniden Başlat'));
  console.log(chalk.white('[3] Botu Durdur'));
  console.log('');
  console.log(chalk.white('[4] Ayarlar'));
  console.log(chalk.white('[0] Çıkış'));
  console.log('');
  console.log(menuRule());
  console.log('');
}

async function submenuSettings(rl) {
  for (;;) {
    printSubmenuBox('Ayarlar');
    console.log(chalk.white('[1] - Bot Ayarları'));
    console.log(chalk.white('[2] - Discord Ayarları'));
    console.log(chalk.white('[3] - Sıfırlama'));
    console.log(chalk.white('[4] - Yedekler'));
    console.log(chalk.white(''));
    console.log(chalk.white('[0] - Ana Menü\n'));
    const c = (await prompt(rl)).trim();
    if (c === '0') return;
    if (c === '1') {
      await submenuEnv(rl);
      continue;
    }
    if (c === '2') {
      await submenuGeneral(rl);
      continue;
    }
    if (c === '3') {
      await submenuReset(rl);
      return;
    }
    if (c === '4') {
      await submenuBackup(rl);
      continue;
    }
    console.log(chalk.red('❌ Geçersiz seçim.\n'));
  }
}

async function mainMenu(rl) {
  printBannerBlock();

  for (;;) {
    if (redrawMainMenuWithBanner) {
      clearConsole();
      printBannerBlock();
      redrawMainMenuWithBanner = false;
    }
    printStatusPanel();
    printMenuOptions();

    const choice = (await prompt(rl)).trim();

    switch (choice) {
      case '1':
        if (isBotRunning()) {
          await countdownToMainMenu('✅ Bot zaten çalışıyor.', 'success');
        } else if (startBot()) {
          await afterBotStartSequence();
        }
        break;
      case '2':
        await restartBotFromMenu();
        break;
      case '3':
        await stopBotFromMenu();
        break;
      case '4':
        await submenuSettings(rl);
        redrawMainMenuWithBanner = true;
        break;
      case '0':
        shuttingDown = true;
        if (isBotRunning()) {
          botChild.kill('SIGTERM');
          await new Promise((r) => setTimeout(r, 1500));
        }
        clearRuntimeFile();
        rl.close();
        console.log(chalk.green('Güle güle.\n'));
        process.exit(0);
      default:
        console.log(chalk.red('❌ Geçersiz seçim.\n'));
    }
  }
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  menuRl = rl;
  try {
    await runSetupWizardIfNeeded(rl);
    await mainMenu(rl);
  } finally {
    try {
      rl.close();
    } catch {
      /* */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
