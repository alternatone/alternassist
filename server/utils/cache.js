/**
 * Simple In-Memory Cache Utility
 *
 * Phase 3 optimization: Caches read-heavy operations with automatic TTL invalidation.
 * Usage: Wrap expensive queries with cache.wrap() for near-instant responses.
 */

class SimpleCache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 60000; // 1 minute default
  }

  /**
   * Get cached value or compute if missing/expired
   */
  wrap(key, fn, ttl = this.defaultTTL) {
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }

    const data = fn();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * Invalidate specific cache key
   */
  invalidate(key) {
    this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching a pattern
   */
  invalidatePattern(pattern) {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Singleton instance
const cache = new SimpleCache();

module.exports = cache;
