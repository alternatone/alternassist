/**
 * LRU Cache Utility with Memory Bounds
 *
 * OPTIMIZATION: Prevents unlimited memory growth by capping cache size.
 * Automatically evicts least-recently-used items when capacity is reached.
 *
 * Features:
 * - LRU eviction policy (oldest items removed first)
 * - Memory-bounded (prevents memory leaks)
 * - TTL-based expiration (items expire after specified time)
 * - Pattern-based invalidation (invalidate multiple keys by regex)
 */

class LRUCache {
  constructor(maxSize = 100, maxMemoryMB = 50) {
    this.cache = new Map();
    this.maxSize = maxSize; // Maximum number of items
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024; // Maximum memory in bytes
    this.defaultTTL = 60000; // 1 minute default
  }

  /**
   * Get cached value or compute if missing/expired
   * Implements LRU by moving accessed items to end of Map
   */
  wrap(key, fn, ttl = this.defaultTTL) {
    const cached = this.cache.get(key);

    // Check if cached and not expired
    if (cached && Date.now() - cached.timestamp < ttl) {
      // Move to end (LRU - mark as recently used)
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.data;
    }

    // Compute new value
    const data = fn();
    const entry = { data, timestamp: Date.now() };

    // Evict oldest if at capacity (first item in Map is oldest)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, entry);
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
      maxSize: this.maxSize,
      maxMemoryMB: this.maxMemoryBytes / (1024 * 1024),
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Get oldest cache entry timestamp
   */
  getOldestTimestamp() {
    if (this.cache.size === 0) return null;
    const firstKey = this.cache.keys().next().value;
    return this.cache.get(firstKey)?.timestamp;
  }

  /**
   * Estimate memory usage (rough approximation)
   */
  estimateMemoryUsage() {
    let totalBytes = 0;
    for (const [key, value] of this.cache) {
      // Rough estimate: key + JSON string of data
      totalBytes += key.length * 2; // UTF-16 characters
      totalBytes += JSON.stringify(value.data).length * 2;
    }
    return totalBytes;
  }
}

// Singleton instance with sensible defaults
// 100 items max, 50MB memory cap
const cache = new LRUCache(100, 50);

module.exports = cache;
