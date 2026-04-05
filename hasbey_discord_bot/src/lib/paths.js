const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = {
  ROOT,
  dataDir: path.join(ROOT, 'data'),
  guildFile: (guildId) => path.join(ROOT, 'data', 'guilds', `${guildId}.json`),
  statsFile: (guildId) => path.join(ROOT, 'data', 'stats', `${guildId}.json`),
  backupDir: (guildId) => path.join(ROOT, 'data', 'backups', guildId),
  /** Başka sunucudan kopyalanan `sunucu-yedek.json` — `/kur` ikinci aranan yol */
  backupImportTemplatePath: path.join(ROOT, 'data', 'backups', 'import', 'sunucu-yedek.json'),
};
