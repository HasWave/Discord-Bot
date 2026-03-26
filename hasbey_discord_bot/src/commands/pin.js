const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');
const { EPHEMERAL } = require('../lib/discordFlags');
const { ROOT } = require('../lib/paths');

const PIN_ONCE_PATH = path.join(ROOT, 'data', 'pin-test-once.json');

function pinTestAlreadyUsed() {
  try {
    const j = JSON.parse(fs.readFileSync(PIN_ONCE_PATH, 'utf8'));
    return Boolean(j.used);
  } catch {
    return false;
  }
}

function markPinTestUsed() {
  fs.mkdirSync(path.dirname(PIN_ONCE_PATH), { recursive: true });
  fs.writeFileSync(
    PIN_ONCE_PATH,
    JSON.stringify({ used: true, at: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pin')
    .setDescription('Bir kezlik slash / bağlantı tanısı (tekrarda devre dışı)'),

  async execute(interaction) {
    if (pinTestAlreadyUsed()) {
      await interaction.editReply({
        content: 'Bu tanı komutu yalnızca **bir kez** kullanılabilir. `/pin` artık kapalı.',
        flags: EPHEMERAL,
      });
      return;
    }

    const ws = interaction.client.ws.ping;
    await interaction.editReply({
      content: `**Test başarılı.** WebSocket: **${ws}** ms. Slash kaydı ve davet kapsamı tamam.`,
      flags: EPHEMERAL,
    });
    markPinTestUsed();
  },
};
