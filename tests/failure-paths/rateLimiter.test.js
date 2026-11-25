import assert from 'node:assert/strict';
import test from 'node:test';

import { clearAllRateLimits, checkRateLimit } from '../../src/utils/rateLimiter.js';
import { logger } from '../../src/utils/logger.js';

test('prunes expired keys before enforcing the rate-limit store capacity', async () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  clearAllRateLimits();

  try {
    for (let index = 0; index < 10_000; index++) {
      assert.equal(await checkRateLimit(`expired-${index}`, 1, 10), true);
    }

    now += 11;
    assert.equal(await checkRateLimit('fresh-key', 1, 10), true);
  } finally {
    clearAllRateLimits();
    Date.now = originalNow;
  }
});

test('rejects new keys when the active rate-limit store is full', async () => {
  const originalNow = Date.now;
  const originalWarn = logger.warn;
  let now = 2_000;
  const warnings = [];
  Date.now = () => now;
  logger.warn = (message, metadata) => warnings.push({ message, metadata });
  clearAllRateLimits();

  try {
    for (let index = 0; index < 10_000; index++) {
      assert.equal(await checkRateLimit(`active-${index}`, 2, 60_000), true);
    }

    assert.equal(await checkRateLimit('active-0', 2, 60_000), true);
    assert.equal(await checkRateLimit('new-key', 2, 60_000), false);
    assert.equal(warnings.at(-1)?.metadata?.event, 'security.rate_limit_store_full');
  } finally {
    clearAllRateLimits();
    logger.warn = originalWarn;
    Date.now = originalNow;
  }
});
