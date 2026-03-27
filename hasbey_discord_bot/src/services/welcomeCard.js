const { createCanvas, loadImage } = require('@napi-rs/canvas');

function escapeText(v, max = 60) {
  return String(v || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function parseHexColor(input, fallback = '#FEE75C') {
  const raw = String(input || '')
    .trim()
    .replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return fallback;
  return `#${raw.toUpperCase()}`;
}

async function loadImageFromUrl(url) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return await loadImage(Buffer.from(arr));
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

async function createWelcomeCard(member, cfg) {
  const card = cfg?.customMessages?.welcomeCard || {};
  const width = 1024;
  const height = 420;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const baseColor = parseHexColor(card.color, '#5865F2');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);

  const backgroundUrl = String(card.imageUrl || '').trim();
  if (backgroundUrl) {
    const bg = await loadImageFromUrl(backgroundUrl);
    if (bg) {
      ctx.drawImage(bg, 0, 0, width, height);
    }
  }

  // Readability overlay for text/avatars on any image.
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.30)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  const avatar = await loadImageFromUrl(avatarUrl);
  const avSize = 170;
  const avX = 70;
  const avY = 90;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avX, avY, avSize, avSize);
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();

  const title = escapeText(card.title || 'Sunucuya katildi', 80);
  const username = escapeText(member.displayName || member.user.username, 48);
  const subtitle = `@${escapeText(member.user.username, 32)} aramiza hos geldi`;

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText(title, 280, 170);

  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(username, 280, 245);

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '30px sans-serif';
  ctx.fillText(subtitle, 280, 300);

  return canvas.toBuffer('image/png');
}

module.exports = {
  createWelcomeCard,
};
