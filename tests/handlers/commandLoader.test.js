import assert from 'node:assert/strict';
import test from 'node:test';
import { registerCommands } from '../../src/handlers/commandLoader.js';

test('registers commands for more than two unique configured guilds', async () => {
  const guildIds = [
    '1367772622678659083',
    '123456789012345678',
    '234567890123456789',
  ];
  const registeredGuilds = [];
  const client = {
    commands: new Map(),
    guilds: {
      fetch: async id => {
        let registeredCount = 0;
        return {
          id,
          name: `Guild ${id}`,
          commands: {
            fetch: async () => ({ size: registeredCount }),
            set: async commands => {
              registeredCount = commands.length;
              registeredGuilds.push(id);
            },
          },
        };
      },
    },
  };

  await registerCommands(client, guildIds);

  assert.deepEqual(registeredGuilds, guildIds);
});

test('rejects duplicate guild IDs during registration', async () => {
  await assert.rejects(
    registerCommands({ commands: new Map() }, [
      '1367772622678659083',
      '1367772622678659083',
    ]),
    /At least two unique valid server IDs/,
  );
});
