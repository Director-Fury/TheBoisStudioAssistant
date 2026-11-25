export const MAINTENANCE_MODE_KEY = 'bot:maintenance_mode';
export const MAINTENANCE_REPLY =
  'Sorry, The Bois Studio Maintainence is currently working on me. I will notify them when they are done';

function applyPresence(client, enabled) {
  client.user.setPresence({
    ...client.config.bot.presence,
    status: enabled ? 'dnd' : client.config.bot.presence.status,
  });
}

export async function restoreMaintenanceMode(client) {
  const storedMode = await client.db.get(MAINTENANCE_MODE_KEY, false);
  const enabled = storedMode === true;

  applyPresence(client, enabled);
  client.maintenanceMode = enabled;
  return enabled;
}

export async function setMaintenanceMode(client, enabled) {
  await client.db.set(MAINTENANCE_MODE_KEY, enabled);
  applyPresence(client, enabled);
  client.maintenanceMode = enabled;
}
