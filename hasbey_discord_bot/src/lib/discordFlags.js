const { MessageFlags } = require('discord.js');

/** Etkileşim yanıtlarında `ephemeral` kullanımı kaldırıldı; `flags` kullanılmalı (Node uyarısını önler). */
const EPHEMERAL = MessageFlags.Ephemeral;

module.exports = { EPHEMERAL };
