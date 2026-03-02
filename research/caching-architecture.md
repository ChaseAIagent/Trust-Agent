# Caching Architecture Research: Solana Wallet Scoring API

## Context

- **Data Source**: Helius API (10M free credits/month)
- **Data Type**: Solana wallet transactions
- **Goals**:
  1. Stay within Helius rate limits
  2. Reduce latency for repeated queries
  3. Minimize costs

---

## Approach 1: In-Memory LRU Cache (Node.js Native)

### Overview
Native JavaScript implementation using `Map` or libraries like `lru-cache` to store frequently accessed wallet data directly in the Node.js process memory.

### Pros
| Advantage | Details |
|-----------|---------|
| **Zero Latency** | Sub-microsecond access (<1μs) — fastest possible option |
| **No Network Overhead** | No external connections, serialization, or network hops |
| **Simple Setup** | No infrastructure to deploy or maintain |
| **Zero Cost** | No external service costs beyond your server |
| **Automatic Cleanup** | LRU eviction handles memory pressure automatically |

### Cons
| Disadvantage | Details |
|--------------|---------|
| **No Persistence** | Cache lost on restart/crash; cold start penalty |
| **Single-Process Only** | Cannot share cache across multiple server instances |
| **Memory Constrained** | Limited by available RAM; large wallets could bloat cache |
| **No Distributed Coordination** | Multiple instances create duplicate cache entries |
| **Node.js Specific** | Memory managed by V8 GC; potential for heap pressure |

### Implementation Complexity
**Low** — Single dependency (`lru-cache`), ~20 lines of code

```javascript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache({
  max: 50000,              // Max entries
  ttl: 1000 * 60 * 60,     // 1 hour default
  updateAgeOnGet: true,    // Extend TTL on access
});
```

### TTL Strategy
| Data Type | Recommended TTL | Rationale |
|-----------|---------------|-----------|
| Wallet balance | 30 seconds | Changes frequently, quick refresh acceptable |
| Transaction history | 5-15 minutes | New transactions added, but history is append-only |
| NFT holdings | 5-10 minutes | Semi-stable, but trades happen |
| Token prices | 30-60 seconds | Highly volatile |
| Wallet risk score | 1-5 minutes | Depends on recent activity patterns |

### Memory Requirements
- **Per Entry**: ~500 bytes (key) + variable payload (~2-10KB for transaction data)
- **50K entries**: ~100-500MB depending on data complexity
- **Wallet transaction data** can be large; consider capping stored history per wallet

### Performance Characteristics
- **Read**: O(1) — constant time
- **Write**: O(1) — constant time
- **Eviction**: O(1) — LRU tracking overhead minimal
- **Throughput**: Millions of ops/sec possible

---

## Approach 2: Redis (External Service)

### Overview
External in-memory data store with optional persistence, running as a separate service (local or cloud-hosted).

### Pros
| Advantage | Details |
|-----------|---------|
| **Persistence** | RDB snapshots & AOF logs survive restarts |
| **Distributed Access** | Multiple app servers share one cache |
| **Pub/Sub Support** | Can invalidate caches across instances |
| **Advanced Eviction** | Multiple policies (LRU, LFU, TTL-based) |
| **Clustering** | Horizontal scaling for massive datasets |
| **Data Structures** | Lists, sets, sorted sets useful for analytics |

### Cons
| Disadvantage | Details |
|--------------|---------|
| **Network Latency** | ~1-5ms roundtrip (local) / 10-50ms (cloud) |
| **Infrastructure Cost** | Redis Cloud ~$5-20/mo; self-hosted needs server |
| **Serialization Overhead** | JSON stringify/parse on every operation |
| **Operational Complexity** | Monitoring, backups, failover setup |
| **Cold Start Penalty** | Initial warmup period |

### Implementation Complexity
**Medium** — Requires Redis server setup and Redis client library

```javascript
import { createClient } from 'redis';

const client = createClient({ url: 'redis://localhost:6379' });
await client.connect();

// With TTL
await client.setEx(`wallet:${address}`, 300, JSON.stringify(data));
const cached = await client.get(`wallet:${address}`);
```

### TTL Strategy
| Data Type | Recommended TTL | Rationale |
|-----------|---------------|-----------|
| Wallet balance | 30-60 seconds | Slight staleness acceptable |
| Transaction history | 10-30 minutes | Helius data updates periodically |
| NFT holdings | 5-15 minutes | Balance between fresh and efficient |
| Token prices | 30-60 seconds | External price feeds change rapidly |
| Wallet risk score | 5-10 minutes | Activity-based scoring, moderate TTL |
| **Aggregate stats** | 1-24 hours | Computed metrics change slowly |

### Memory/Storage Requirements
- **Redis Cloud Free Tier**: 30MB (good for testing)
- **Production Estimate**: 256MB-1GB for 100K+ wallets
- **With persistence**: 2x RAM for RDB + AOF logs
- **Recommended**: Start with 256MB, monitor `used_memory`

### Performance Characteristics
- **Read**: 0.5-2ms (local network) / 10-50ms (cloud)
- **Write**: 0.5-2ms (local) / 10-50ms (cloud)
- **Throughput**: 100K+ ops/sec per Redis instance
- **Serialization**: +0.1-0.5ms for JSON encode/decode

---

## Approach 3: File-Based Caching (JSON on Disk)

### Overview
Simple filesystem storage using JSON files, one per wallet or batched by hash prefix.

### Pros
| Advantage | Details |
|-----------|---------|
| **Simple** | Just filesystem operations |
| **Zero Dependencies** | No external services or libraries needed |
| **Persistence** | Survives restarts automatically |
| **Cheap Storage** | Disks cheaper than RAM |
| **Human Readable** | Easy to debug by inspecting files |

### Cons
| Disadvantage | Details |
|--------------|---------|
| **Very Slow I/O** | Disk reads 100-1000x slower than memory |
| **Serialization Cost** | JSON parse/stringify on every access |
| **File Handle Limits** | OS limits on open files; need careful management |
| **Concurrency Issues** | File locking needed for multi-process safety |
| **No TTL Native** | Must implement expiration manually |
| **Cache Invalidation** | Complex to evict expired entries efficiently |

### Implementation Complexity
**Medium-High** — Deceptively simple for basic use, complex for production

```javascript
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = './cache';

async function getCache(key) {
  const file = path.join(CACHE_DIR, hashKey(key) + '.json');
  try {
    const data = await fs.readFile(file, 'utf8');
    const entry = JSON.parse(data);
    if (Date.now() > entry.expires) {
      await fs.unlink(file); // Expired
      return null;
    }
    return entry.data;
  } catch { return null; }
}

async function setCache(key, data, ttlMs) {
  const file = path.join(CACHE_DIR, hashKey(key) + '.json');
  const entry = { data, expires: Date.now() + ttlMs };
  await fs.writeFile(file, JSON.stringify(entry));
}
```

### TTL Strategy
| Data Type | Recommended TTL | Notes |
|-----------|---------------|-------|
| All data | 5-60 minutes | File I/O is slow; longer TTLs amortize cost |
| **Cleanup** | Background job to delete expired files hourly |

### Memory/Storage Requirements
- **Storage**: Minimal (just disk space)
- **Memory**: Only active file buffers cached by OS
- **Disk**: ~1-10KB per wallet entry (compressed)
- **10K wallets**: ~100MB disk space

### Performance Characteristics
- **Read**: 5-50ms (SSD) / 50-200ms (HDD)
- **Write**: 10-100ms (SSD) / 100-500ms (HDD)
- **Throughput**: 100-1000 ops/sec (limited by disk I/O)
- **Cold Files**: First read slower due to disk seek

---

## Comparative Analysis

| Factor | In-Memory LRU | Redis | File-Based |
|--------|---------------|-------|------------|
| **Latency** | ⭐⭐⭐⭐⭐ <1μs | ⭐⭐⭐ 1-50ms | ⭐ 5-200ms |
| **Throughput** | ⭐⭐⭐⭐⭐ Millions/sec | ⭐⭐⭐⭐ 100K/sec | ⭐⭐ 100-1K/sec |
| **Persistence** | ❌ None | ✅ Yes | ✅ Yes |
| **Distributed** | ❌ No | ✅ Yes | ⚠️ Complex |
| **Setup Complexity** | ⭐⭐⭐⭐⭐ Low | ⭐⭐⭐ Medium | ⭐⭐⭐⭐ Low |
| **Operational Overhead** | ⭐⭐⭐⭐⭐ None | ⭐⭐ Medium | ⭐⭐⭐ Low |
| **Cost** | ⭐⭐⭐⭐⭐ Free | ⭐⭐⭐ $5-20/mo | ⭐⭐⭐⭐⭐ Free |
| **TTL Management** | ✅ Built-in | ✅ Built-in | ⚠️ Manual |
| **Memory Efficiency** | ⭐⭐⭐ Good | ⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Disk |

---

## Recommendation

### Primary Recommendation: **Hybrid Approach — In-Memory LRU + Redis**

For a Solana wallet scoring API with 10M Helius credits/month:

**Why This Combination?**

1. **L1 Cache (In-Memory LRU)**:
   - Hot wallet data (<1000 most active wallets)
   - Sub-microsecond access for repeated queries
   - Protects against burst traffic
   - Zero network overhead

2. **L2 Cache (Redis)**:
   - Shared across all server instances
   - Survives restarts
   - Handles warm data (1000-50K wallets)
   - Enables horizontal scaling

3. **Helius API (L3)**:
   - Cold data fallback
   - Ultimate source of truth

### Implementation Sketch

```javascript
import { LRUCache } from 'lru-cache';
import { createClient } from 'redis';

class TieredWalletCache {
  constructor(redisUrl) {
    // L1: Hot cache - 1000 most recent
    this.l1 = new LRUCache({
      max: 1000,
      ttl: 60 * 1000, // 1 min in-memory
      updateAgeOnGet: true,
    });
    
    // L2: Redis for persistence & sharing
    this.l2 = createClient({ url: redisUrl });
    this.l2.connect();
    
    // Cache TTLs by data type
    this.ttls = {
      balance: 30,        // seconds
      transactions: 300,  // 5 minutes
      riskScore: 120,   // 2 minutes
    };
  }

  async get(key, fetcher, type = 'transactions') {
    // L1 Check
    const cached = this.l1.get(key);
    if (cached) return cached;

    // L2 Check
    const redisData = await this.l2.get(key);
    if (redisData) {
      const parsed = JSON.parse(redisData);
      this.l1.set(key, parsed); // Promote to L1
      return parsed;
    }

    // L3: Fetch from Helius
    const data = await fetcher();
    
    // Populate both caches
    const ttl = this.ttls[type] || 300;
    this.l1.set(key, data);
    await this.l2.setEx(key, ttl, JSON.stringify(data));
    
    return data;
  }

  async invalidate(key) {
    this.l1.delete(key);
    await this.l2.del(key);
  }
}

// Usage
const cache = new TieredWalletCache(process.env.REDIS_URL);

// In your API route
app.get('/wallet/:address/score', async (req, res) => {
  const { address } = req.params;
  const score = await cache.get(
    `score:${address}`,
    () => helius.getWalletScore(address),
    'riskScore'
  );
  res.json(score);
});
```

### Cost Projection

| Component | Monthly Cost |
|-----------|-------------|
| In-Memory LRU | $0 (included in server) |
| Redis Cloud (30MB) | $0 (free tier) |
| Redis Cloud (256MB) | ~$5-12 |
| **Total** | **$0-12/month** |

### Monitoring Recommendations

```javascript
// Track cache hit rates
const stats = {
  l1: { hits: 0, misses: 0 },
  l2: { hits: 0, misses: 0 },
  api: { calls: 0 },
};

// Export metrics for observability
function getMetrics() {
  return {
    l1HitRate: stats.l1.hits / (stats.l1.hits + stats.l1.misses),
    l2HitRate: stats.l2.hits / (stats.l2.hits + stats.l2.misses),
    apiCalls: stats.api.calls,
    heliusCreditsUsed: stats.api.calls, // Estimate
  };
}
```

---

## Alternative: Single-Node Simplicity

If running on a single server (no horizontal scaling needed):

**Use In-Memory LRU only** — It's simpler, faster, and sufficient. Add Redis later when you need multiple instances.

---

## Summary

| Priority | Recommendation |
|----------|----------------|
| **Speed + Simple** | In-Memory LRU only |
| **Production + Scale** | Hybrid: LRU + Redis |
| **Never Use** | File-based (too slow for API workloads) |

The hybrid approach gives you the best of both worlds: blistering speed for hot data with the resilience and sharing capability needed for production deployments.
