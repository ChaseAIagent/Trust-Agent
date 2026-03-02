/**
 * In-Memory LRU Cache for AgentTrust API
 * 
 * Caches Helius API responses to:
 * - Stay within rate limits (10M credits/month)
 * - Reduce latency for repeated queries
 * - Minimize costs
 * 
 * TTL Strategy:
 * - Wallet balance: 5 minutes (changes frequently)
 * - Transaction history: 30 minutes (relatively stable)
 * - Score results: 15 minutes (balances freshness with efficiency)
 */

class LRUCache {
  constructor(maxSize = 1000, defaultTTL = 300000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL; // 5 minutes default
    this.cache = new Map();
    this.accessOrder = new Set();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0
    };
  }

  /**
   * Generate cache key from method and parameters
   */
  generateKey(prefix, params) {
    const sorted = Object.keys(params).sort().reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
    return `${prefix}:${JSON.stringify(sorted)}`;
  }

  /**
   * Get value from cache
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access order (LRU)
    this.accessOrder.delete(key);
    this.accessOrder.add(key);
    this.stats.hits++;
    
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key, value, customTTL = null) {
    // Evict oldest if at capacity
    while (this.cache.size >= this.maxSize && this.accessOrder.size > 0) {
      const oldest = this.accessOrder.values().next().value;
      this.delete(oldest);
      this.stats.evictions++;
    }

    const ttl = customTTL || this.defaultTTL;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
    this.accessOrder.add(key);
    this.stats.size = this.cache.size;
  }

  /**
   * Delete key from cache
   */
  delete(key) {
    this.cache.delete(key);
    this.accessOrder.delete(key);
    this.stats.size = this.cache.size;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.stats.size = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      memoryUsageMB: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage (rough approximation)
   */
  estimateMemoryUsage() {
    // Rough estimate: 1KB per entry average
    return (this.cache.size * 1 / 1024).toFixed(2);
  }

  /**
   * Get expired keys for cleanup
   */
  getExpiredKeys() {
    const expired = [];
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expired.push(key);
      }
    }
    return expired;
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const expired = this.getExpiredKeys();
    for (const key of expired) {
      this.delete(key);
    }
    return expired.length;
  }
}

/**
 * AgentTrust-specific cache manager
 * Pre-configured TTLs for different data types
 */
class AgentTrustCache {
  constructor(options = {}) {
    this.cache = new LRUCache(options.maxSize || 1000);
    this.ttls = {
      balance: 5 * 60 * 1000,        // 5 minutes
      signatures: 10 * 60 * 1000,    // 10 minutes
      transactions: 30 * 60 * 1000,  // 30 minutes
      score: 15 * 60 * 1000,         // 15 minutes
      dexData: 5 * 60 * 1000         // 5 minutes
    };
    
    // Auto-cleanup every 10 minutes
    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cache.cleanup();
      if (cleaned > 0) {
        console.log(`[Cache] Cleaned up ${cleaned} expired entries`);
      }
    }, 10 * 60 * 1000);
  }

  /**
   * Get wallet balance (cached)
   */
  async getBalance(address, fetchFn) {
    const key = this.cache.generateKey('balance', { address });
    const cached = this.cache.get(key);
    
    if (cached !== null) {
      return { value: cached, cached: true };
    }

    const value = await fetchFn();
    this.cache.set(key, value, this.ttls.balance);
    return { value, cached: false };
  }

  /**
   * Get transaction signatures (cached)
   */
  async getSignatures(address, limit, fetchFn) {
    const key = this.cache.generateKey('signatures', { address, limit });
    const cached = this.cache.get(key);
    
    if (cached !== null) {
      return { value: cached, cached: true };
    }

    const value = await fetchFn();
    this.cache.set(key, value, this.ttls.signatures);
    return { value, cached: false };
  }

  /**
   * Get parsed transactions (cached)
   */
  async getTransactions(signatures, fetchFn) {
    const key = this.cache.generateKey('transactions', { sigs: signatures.slice(0, 5) });
    const cached = this.cache.get(key);
    
    if (cached !== null) {
      return { value: cached, cached: true };
    }

    const value = await fetchFn();
    this.cache.set(key, value, this.ttls.transactions);
    return { value, cached: false };
  }

  /**
   * Get wallet score (cached)
   */
  async getScore(address, options, fetchFn) {
    const key = this.cache.generateKey('score', { address, ...options });
    const cached = this.cache.get(key);
    
    if (cached !== null) {
      return { ...cached, cached: true };
    }

    const value = await fetchFn();
    this.cache.set(key, value, this.ttls.score);
    return { ...value, cached: false };
  }

  /**
   * Invalidate cache for a specific wallet
   */
  invalidateWallet(address) {
    const prefixes = ['balance', 'signatures', 'transactions', 'score'];
    let count = 0;
    
    for (const [key] of this.cache.cache) {
      if (key.includes(address)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Stop auto-cleanup
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = { LRUCache, AgentTrustCache };
