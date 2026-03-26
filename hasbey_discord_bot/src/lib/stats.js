const fs = require('fs');
const path = require('path');
const { dataDir, statsFile } = require('./paths');

function ensureStatsDir() {
  if (!fs.existsSync(path.join(dataDir, 'stats'))) {
    fs.mkdirSync(path.join(dataDir, 'stats'), { recursive: true });
  }
}

function readStats(guildId) {
  ensureStatsDir();
  const fp = statsFile(guildId);
  if (!fs.existsSync(fp)) {
    return {
      totalMemberEvents: { joins: 0, leaves: 0 },
      lastJoin: null,
      lastLeave: null,
      voiceChannelJoins: {},
      peakOnlineVoice: 0,
      updatedAt: null,
    };
  }
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return {
      totalMemberEvents: { joins: 0, leaves: 0 },
      lastJoin: null,
      lastLeave: null,
      voiceChannelJoins: {},
      peakOnlineVoice: 0,
      updatedAt: null,
    };
  }
}

function writeStats(guildId, stats) {
  ensureStatsDir();
  stats.updatedAt = new Date().toISOString();
  fs.writeFileSync(statsFile(guildId), JSON.stringify(stats, null, 2), 'utf8');
}

function bumpVoiceJoin(guildId, channelId) {
  const s = readStats(guildId);
  const key = String(channelId);
  s.voiceChannelJoins[key] = (s.voiceChannelJoins[key] || 0) + 1;
  writeStats(guildId, s);
}

function recordJoin(guildId, payload) {
  const s = readStats(guildId);
  s.totalMemberEvents.joins += 1;
  s.lastJoin = { ...payload, at: new Date().toISOString() };
  writeStats(guildId, s);
}

module.exports = {
  readStats,
  writeStats,
  bumpVoiceJoin,
  recordJoin,
};
