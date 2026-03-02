/**
 * Rate Limiter for AgentTrust API
 * 
 * Protects against:
 * - API abuse and DDoS
 * - Exceeding Helius rate limits
 * - Runaway costs
 * 
 * Tiers:
 * - Free: 100 requests/day per IP
 * - Pro: 10,000 requests/day per API key
 * - Enterprise: Unlimited (within reason)
 */

class RateLimiter {
  constructor(options = {}) {
    this.requests = new Map(); // ip/key -> { count, resetTime, totalUsed }
    this.blocked = new Set(); // Blocked IPs/keys
    this.tiers = {
      // Free: 100 total lifetime + 10/day after that
      free: { 
        daily: 10, 
        total: 100,
        window: 24 * 60 * 60 * 1000 
      },
      // Pro: 5K/day with $50/month subscription
      pro: { 
        daily: 5000, 
        window: 24 * 60 * 60 * 1000 
      },
      // Enterprise: Unlimited
      enterprise: { 
        daily: Infinity, 
        window: 24 * 60 * 60 * 1000 
      }
    };
    this.defaultTier = options.defaultTier || 'free';
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      tierBreakdown: { free: 0, pro: 0, enterprise: 0 }
    };
  }

  /**
   * Generate key for rate limit tracking
   */
  getKey(identifier, tier = null) {
    const effectiveTier = tier || this.defaultTier;
    return `${effectiveTier}:${identifier}`;
  }

  /**
   * Check if request is allowed
   */
  check(identifier, tier = null) {
    const key = this.getKey(identifier, tier);
    const effectiveTier = tier || this.defaultTier;
    
    // Check if blocked
    if (this.blocked.has(identifier)) {
      this.stats.blockedRequests++;
      return {
        allowed: false,
        reason: 'BLOCKED',
        retryAfter: null
      };
    }

    const config = this.tiers[effectiveTier];
    const now = Date.now();
    
    // Get or create tracking entry
    let entry = this.requests.get(key);
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        totalUsed: entry?.totalUsed || 0, // Preserve total across windows
        resetTime: now + config.window
      };
      this.requests.set(key, entry);
    }

    // Free tier: Check total lifetime limit first
    if (effectiveTier === 'free' && config.total) {
      if (entry.totalUsed >= config.total) {
        return {
          allowed: false,
          reason: 'FREE_TIER_EXCEEDED',
          message: `Free tier limit of ${config.total} scores reached. Upgrade to Pro.`,
          upgradeUrl: '/pricing'
        };
      }
    }

    // Check daily limit
    const limit = config.daily || config.requests;
    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return {
        allowed: false,
        reason: 'RATE_LIMITED',
        retryAfter,
        limit: limit,
        remaining: 0
      };
    }

    return {
      allowed: true,
      limit: limit,
      remaining: limit - entry.count - 1,
      totalRemaining: effectiveTier === 'free' ? config.total - entry.totalUsed : Infinity,
      resetTime: entry.resetTime
    };
  }

  /**
   * Record a request
   */
  record(identifier, tier = null) {
    const key = this.getKey(identifier, tier);
    const effectiveTier = tier || this.defaultTier;
    
    let entry = this.requests.get(key);
    if (entry) {
      entry.count++;
      // Track total lifetime usage for free tier
      if (effectiveTier === 'free') {
        entry.totalUsed = (entry.totalUsed || 0) + 1;
      }
    }
    
    this.stats.totalRequests++;
    this.stats.tierBreakdown[effectiveTier]++;
  }

  /**
   * Middleware for Express/Fastify
   */
  middleware(options = {}) {
    const getIdentifier = options.getIdentifier || ((req) => req.ip);
    const getTier = options.getTier || (() => null);
    
    return (req, res, next) => {
      const identifier = getIdentifier(req);
      const tier = getTier(req);
      
      const result = this.check(identifier, tier);
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining || 0);
      if (result.resetTime) {
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
      }
      
      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter || 3600);
        
        if (result.reason === 'RATE_LIMITED') {
          return res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Limit: ${result.limit} requests per day. Reset in ${result.retryAfter}s`,
            retryAfter: result.retryAfter
          });
        }
        
        if (result.reason === 'BLOCKED') {
          return res.status(403).json({
            error: 'Access blocked',
            message: 'This IP/API key has been blocked. Contact support.'
          });
        }
      }
      
      this.record(identifier, tier);
      next();
    };
  }

  /**
   * Block an IP or API key
   */
  block(identifier, reason = 'Manual block') {
    this.blocked.add(identifier);
    console.log(`[RateLimiter] Blocked ${identifier}: ${reason}`);
    return { blocked: true, identifier, reason };
  }

  /**
   * Unblock an IP or API key
   */
  unblock(identifier) {
    this.blocked.delete(identifier);
    return { unblocked: true, identifier };
  }

  /**
   * Get current usage for an identifier
   */
  getUsage(identifier, tier = null) {
    const key = this.getKey(identifier, tier);
    const effectiveTier = tier || this.defaultTier;
    const config = this.tiers[effectiveTier];
    
    const entry = this.requests.get(key);
    if (!entry) {
      return {
        used: 0,
        limit: config.requests,
        remaining: config.requests,
        resetTime: Date.now() + config.window
      };
    }
    
    return {
      used: entry.count,
      limit: config.requests,
      remaining: Math.max(0, config.requests - entry.count),
      resetTime: entry.resetTime
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeTrackers: this.requests.size,
      blockedCount: this.blocked.size
    };
  }

  /**
   * Cleanup old entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetTime) {
        this.requests.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Reset all limits (for testing)
   */
  reset() {
    this.requests.clear();
    this.blocked.clear();
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      tierBreakdown: { free: 0, pro: 0, enterprise: 0 }
    };
  }
}

/**
 * Simple sliding window rate limiter for Helius API protection
 */
class HeliusRateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
    this.stats = { throttled: 0, allowed: 0 };
  }

  /**
   * Check if request should be throttled
   */
  check() {
    const now = Date.now();
    
    // Remove old requests outside window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      this.stats.throttled++;
      const oldest = this.requests[0];
      const waitTime = this.windowMs - (now - oldest);
      return {
        allowed: false,
        waitTime,
        currentUsage: this.requests.length
      };
    }
    
    this.requests.push(now);
    this.stats.allowed++;
    return {
      allowed: true,
      remaining: this.maxRequests - this.requests.length,
      currentUsage: this.requests.length
    };
  }

  /**
   * Get current usage
   */
  getUsage() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    return {
      current: this.requests.length,
      max: this.maxRequests,
      remaining: this.maxRequests - this.requests.length
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

module.exports = { RateLimiter, HeliusRateLimiter };
