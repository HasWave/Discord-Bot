const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bot.log');

function ensureDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/** Log satırında kırılma / gereksiz boşluk olmasın */
function sanitizeOneLine(s) {
  return String(s)
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function appendBotLog(message) {
  try {
    ensureDir();
    const line = sanitizeOneLine(message);
    if (!line) return;
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
  } catch {
    /* logger must not throw */
  }
}

/**
 * Dosyaya yazılacak tek satırlık hata özeti (stack varsayılan kapalı).
 */
function formatErr(err) {
  if (err == null) return 'unknown error';
  if (typeof err === 'string') return sanitizeOneLine(err);
  const name = err.constructor?.name || 'Error';
  const meta = [];
  if (err.code != null) meta.push(`code=${err.code}`);
  if (err.status != null) meta.push(`http=${err.status}`);
  const metaStr = meta.length ? ` ${meta.join(' ')}` : '';
  const msg = sanitizeOneLine(err.message || String(err));
  let out = `${name}${metaStr}: ${msg}`;
  if (process.env.BOT_LOG_STACK === '1' && err.stack) {
    const head = err.stack
      .split('\n')
      .slice(0, 4)
      .map((l) => sanitizeOneLine(l))
      .join(' ← ');
    out += ` | ${head}`;
  }
  return out;
}

function logError(scope, err) {
  appendBotLog(`[ERROR] ${scope} | ${formatErr(err)}`);
}

function logWarn(scope, detail) {
  appendBotLog(`[WARN] ${scope} | ${sanitizeOneLine(detail)}`);
}

function logInfo(scope, detail) {
  appendBotLog(`[INFO] ${scope} | ${sanitizeOneLine(detail)}`);
}

function installProcessErrorLogging() {
  process.on('unhandledRejection', (reason) => {
    logError('unhandledRejection', reason);
    console.error('unhandledRejection', reason);
  });
  process.on('uncaughtException', (err) => {
    logError('uncaughtException', err);
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  LOG_FILE,
  appendBotLog,
  logError,
  logWarn,
  logInfo,
  formatErr,
  sanitizeOneLine,
  installProcessErrorLogging,
};
