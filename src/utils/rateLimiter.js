import { logger } from './logger.js';

const rateLimitStore = new Map();
const MAX_RATE_LIMIT_ENTRIES = 10_000;

export async function checkRateLimit(key, maxAttempts = 5, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
      for (const [storedKey, storedEntry] of rateLimitStore) {
        if (now - storedEntry.windowStart > storedEntry.windowMs) {
          rateLimitStore.delete(storedKey);
        }
      }

      if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
        logger.warn('Rate limit store reached capacity; rejecting a new key', {
          event: 'security.rate_limit_store_full',
          capacity: MAX_RATE_LIMIT_ENTRIES
        });
        return false;
      }
    }

    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
      windowMs
    });
    return true;
  }

  if (entry.count < maxAttempts) {
    entry.count++;
    entry.windowMs = windowMs;
    return true;
  }

  logger.debug(`Rate limit exceeded for ${key}`);
  return false;
}

export function getRateLimitStatus(key, windowMs = 60000) {
  const entry = rateLimitStore.get(key);
  if (!entry) {
    return { limited: false, remaining: windowMs };
  }

  const elapsed = Date.now() - entry.windowStart;
  const remaining = Math.max(0, windowMs - elapsed);

  return {
    limited: remaining > 0,
    remaining,
    attempts: entry.count
  };
}





export function clearRateLimit(key) {
  rateLimitStore.delete(key);
}

export function clearAllRateLimits() {
  rateLimitStore.clear();
  logger.info('All rate limits cleared');
}
