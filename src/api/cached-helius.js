/**
 * Cached Helius Client
 * 
 * Wraps HeliusClient with LRU caching to:
 * - Reduce API calls (stay within 10M/month free tier)
 * - Improve response times
 * - Handle rate limiting gracefully
 */

const { HeliusClient } = require('./helius');
const { AgentTrustCache } = require('../utils/cache');
const { HeliusRateLimiter } = require('../utils/rate-limiter');

class CachedHeliusClient {
  constructor(options = {}) {
    this.client = new HeliusClient();
    this.cache = new AgentTrustCache({ maxSize: options.cacheSize || 1000 });
    this.rateLimiter = new HeliusRateLimiter(
      options.maxRps || 100,     // Max 100 requests per minute
      options.rateWindow || 60000  // 1 minute window
    );
    this.stats = {
      apiCalls: 0,
      cacheHits: 0,
      rateLimited: 0
    };
  }

  /**
   * Get account balance with caching
   */
  async getBalance(address) {
    return this.cache.getBalance(address, async () => {
      await this.throttleIfNeeded();
      this.stats.apiCalls++;
      return this.client.getBalance(address);
    });
  }

  /**
   * Get transaction signatures with caching
   */
  async getTransactionSignatures(address, limit = 100) {
    return this.cache.getSignatures(address, limit, async () => {
      await this.throttleIfNeeded();
      this.stats.apiCalls++;
      return this.client.getTransactionSignatures(address, limit);
    });
  }

  /**
   * Get parsed transactions with caching
   */
  async parseTransactions(signatures) {
    return this.cache.getTransactions(signatures, async () => {
      await this.throttleIfNeeded();
      this.stats.apiCalls++;
      return this.client.parseTransactions(signatures);
    });
  }

  /**
   * Throttle if approaching rate limits
   */
  async throttleIfNeeded() {
    const check = this.rateLimiter.check();
    
    if (!check.allowed) {
      this.stats.rateLimited++;
      console.log(`[CachedHelius] Rate limit hit, waiting ${check.waitTime}ms...`);
      await this.sleep(check.waitTime);
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Analyze wallet with caching
   */
  async analyzeWallet(address, options = {}) {
    // Try cache first
    const cacheKey = this.cache.cache.generateKey('analysis', { address, ...options });
    const cached = this.cache.cache.get(cacheKey);
    
    if (cached !== null) {
      this.stats.cacheHits++;
      return { ...cached, cached: true };
    }

    // Fetch fresh data
    await this.throttleIfNeeded();
    this.stats.apiCalls++;
    const result = await this.client.analyzeWallet(address, options);
    
    // Cache for 15 minutes
    this.cache.cache.set(cacheKey, result, 15 * 60 * 1000);
    
    return { ...result, cached: false };
  }

  /**
   * Get wallet score with full caching
   */
  async getScore(address, options = {}) {
    return this.cache.getScore(address, options, async () => {
      // This would call the scoring engine
      // For now, placeholder that analyzes wallet
      await this.throttleIfNeeded();
      this.stats.apiCalls++;
      
      const analysis = await this.analyzeWallet(address, options);
      return {
        address,
        score: analysis.score || 0,
        analysis,
        timestamp: Date.now()
      };
    });
  }

  /**
   * Invalidate cache for a wallet
   */
  invalidateWallet(address) {
    return this.cache.invalidateWallet(address);
  }

  /**
   * Get combined statistics
   */
  getStats() {
    return {
      ...this.stats,
      cache: this.cache.getStats(),
      rateLimiter: this.rateLimiter.getStats(),
      apiEfficiency: this.calculateEfficiency()
    };
  }

  /**
   * Calculate API efficiency (cache hit rate)
   */
  calculateEfficiency() {
    const total = this.stats.apiCalls + this.stats.cacheHits;
    if (total === 0) return '0%';
    return ((this.stats.cacheHits / total) * 100).toFixed(2) + '%';
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const start = Date.now();
      // Try to get balance for a known address (System Program)
      await this.getBalance('11111111111111111111111111111111');
      return {
        healthy: true,
        latency: Date.now() - start,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        healthy: false,
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Stop cleanup intervals
   */
  stop() {
    this.cache.stop();
  }
}

module.exports = { CachedHeliusClient };
