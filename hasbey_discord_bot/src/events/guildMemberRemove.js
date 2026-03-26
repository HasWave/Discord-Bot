const { queueMemberCountUpdate } = require('../services/channelStatus');

module.exports = async function onGuildMemberRemove(member) {
  queueMemberCountUpdate(member.client, member.guild);
};
