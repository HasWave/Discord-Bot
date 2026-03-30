const fs = require('fs');
const path = require('path');
const { dataDir } = require('./paths');

const SUBDIR = 'guest-register-dm-once';

function dirPath() {
  return path.join(dataDir, SUBDIR);
}

function filePath(guildId) {
  return path.join(dirPath(), `${String(guildId)}.json`);
}

function readUserSet(guildId) {
  try {
    const j = JSON.parse(fs.readFileSync(filePath(guildId), 'utf8'));
    const arr = Array.isArray(j.userIds) ? j.userIds : [];
    return new Set(arr.map((id) => String(id)).filter((id) => /^\d{10,25}$/.test(id)));
  } catch {
    return new Set();
  }
}

function hasReceivedGuestRegisterDm(guildId, userId) {
  return readUserSet(guildId).has(String(userId));
}

function markReceivedGuestRegisterDm(guildId, userId) {
  const gid = String(guildId);
  const uid = String(userId);
  if (!/^\d{10,25}$/.test(uid)) return;
  const d = dirPath();
  try {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  } catch {
    /* */
  }
  const set = readUserSet(gid);
  if (set.has(uid)) return;
  set.add(uid);
  fs.writeFileSync(filePath(gid), JSON.stringify({ userIds: [...set] }, null, 2), 'utf8');
}

/** Kayıt tamamlanınca tekrar misafir olursa bir kez daha DM gönderilebilsin */
function clearGuestRegisterDmOnce(guildId, userId) {
  const gid = String(guildId);
  const uid = String(userId);
  const set = readUserSet(gid);
  if (!set.delete(uid)) return;
  const fp = filePath(gid);
  if (set.size === 0) {
    try {
      fs.unlinkSync(fp);
    } catch {
      /* */
    }
    return;
  }
  try {
    fs.writeFileSync(fp, JSON.stringify({ userIds: [...set] }, null, 2), 'utf8');
  } catch {
    /* */
  }
}

module.exports = {
  hasReceivedGuestRegisterDm,
  markReceivedGuestRegisterDm,
  clearGuestRegisterDmOnce,
};
