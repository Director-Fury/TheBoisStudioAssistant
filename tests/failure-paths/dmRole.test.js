import test from 'node:test';
import assert from 'node:assert/strict';

import { getRoleRecipients } from '../../src/utils/roleRecipientUtils.js';

test('getRoleRecipients fetches the full guild member list before checking the role', async () => {
  let fetchCalls = 0;

  const guild = {
    members: {
      async fetch(options) {
        fetchCalls += 1;
        assert.equal(options.force, true);
        return [
          { id: 'user-1', user: { bot: false }, roles: { cache: { has: () => true } } },
          { id: 'user-2', user: { bot: false }, roles: { cache: { has: () => false } } },
          { id: 'user-3', user: { bot: true }, roles: { cache: { has: () => true } } },
        ];
      },
    },
  };

  const role = { id: 'role-1' };
  const recipients = await getRoleRecipients(guild, role);

  assert.equal(fetchCalls, 1);
  assert.deepEqual(recipients.map(member => member.id), ['user-1']);
});
