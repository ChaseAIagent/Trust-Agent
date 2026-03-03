/**
 * AgentTrust API Server
 * Centralized service to capture the Trust Graph
 */

const http = require('http');
const { ScoringEngine } = require('./src/scoring/engine');
const { CachedHeliusClient } = require('./src/api/cached-helius');
const { RateLimiter } = require('./src/utils/rate-limiter');
const fs = require('fs');
const path = require('path');

// Simple in-memory DB (migrate to PostgreSQL when scale demands)
const trustGraph = {
  scores: new Map(),      // address -> score data
  patterns: new Map(),    // address -> pattern flags
  relationships: new Map() // address -> related addresses
};

// Ensure data directory exists
const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load existing data
const SCORES_FILE = path.join(DATA_DIR, 'scores.jsonl');
if (fs.existsSync(SCORES_FILE)) {
  const lines = fs.readFileSync(SCORES_FILE, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      trustGraph.scores.set(record.address, record);
    } catch {}
  }
  console.log(`📊 Loaded ${trustGraph.scores.size} existing scores`);
}

// Initialize services
const helius = new CachedHeliusClient();
const engine = new ScoringEngine(helius);
const rateLimiter = new RateLimiter();

const PORT = process.env.PORT || 3000;

function saveScore(record) {
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(SCORES_FILE, line);
  trustGraph.scores.set(record.address, record);
}

function getScoreFromCache(address) {
  const cached = trustGraph.scores.get(address);
  if (!cached) return null;
  
  // Cache TTL: 15 minutes
  const age = Date.now() - cached.timestamp;
  if (age > 15 * 60 * 1000) {
    return null; // Expired
  }
  
  return { ...cached, cached: true };
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }
  
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  
  // Health check
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      healthy: true,
      version: '1.0.0',
      scoresCount: trustGraph.scores.size,
      timestamp: new Date().toISOString()
    }));
  }
  
  // Score endpoint
  if (path.startsWith('/api/v1/score/')) {
    const address = path.split('/api/v1/score/')[1];
    
    if (!address || address.length < 32) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid wallet address' }));
    }
    
    // Get tier from query or header
    const tier = url.searchParams.get('tier') || 'free';
    const apiKey = req.headers['authorization']?.replace('Bearer ', '');
    const identifier = tier === 'free' ? req.connection.remoteAddress : (apiKey || req.connection.remoteAddress);
    
    // Rate limiting
    const rateCheck = rateLimiter.check(identifier, tier);
    if (!rateCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        error: rateCheck.reason,
        message: rateCheck.message || 'Rate limit exceeded',
        retryAfter: rateCheck.retryAfter
      }));
    }
    
    // Check cache first
    const cached = getScoreFromCache(address);
    if (cached) {
      rateLimiter.record(identifier, tier);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        address,
        score: cached.score,
        riskLevel: cached.patterns?.riskLevel,
        cached: true,
        timestamp: cached.timestamp
      }));
    }
    
    try {
      // Score the wallet
      const result = await engine.scoreWallet(address, {
        txLimit: 100,
        includePatterns: true
      });
      
      // Record usage
      rateLimiter.record(identifier, tier);
      
      // Build response
      const response = {
        address,
        score: result.score,
        riskLevel: result.patterns?.riskLevel || 'UNKNOWN',
        breakdown: {
          performance: result.scoreBreakdown?.performance || 0,
          security: result.scoreBreakdown?.security || 0,
          identity: result.scoreBreakdown?.identity || 0
        },
        analysis: {
          balance: result.analysis?.balance,
          transactionCount: result.analysis?.transactionCount,
          accountAge: result.analysis?.accountAge
        },
        patterns: tier === 'pro' ? {
          securityDeduction: result.patterns?.securityDeduction,
          riskFlags: result.patterns?.riskFlags?.map(f => ({
            level: f.level,
            category: f.category,
            reason: f.reason
          }))
        } : undefined,
        timestamp: Date.now(),
        tier
      };
      
      // Save to trust graph (private)
      saveScore(response);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      
    } catch (err) {
      console.error('Scoring error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scoring failed', message: err.message }));
    }
    return;
  }
  
  // Batch score endpoint
  if (path === '/api/v1/batch/score' && req.method === 'POST') {
    // Simple implementation - parse JSON body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { addresses } = JSON.parse(body);
        if (!Array.isArray(addresses) || addresses.length > 10) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Max 10 addresses per batch' }));
        }
        
        const results = [];
        for (const addr of addresses) {
          const cached = getScoreFromCache(addr);
          if (cached) {
            results.push(cached);
          } else {
            const result = await engine.scoreWallet(addr, { txLimit: 50, includePatterns: false });
            const record = {
              address: addr,
              score: result.score,
              riskLevel: result.patterns?.riskLevel,
              timestamp: Date.now()
            };
            saveScore(record);
            results.push(record);
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  // Stats endpoint (admin only - no auth for now, add later)
  if (path === '/api/v1/stats') {
    const stats = {
      totalScores: trustGraph.scores.size,
      rateLimits: rateLimiter.getStats(),
      cacheStats: helius.getStats()
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(stats));
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`💀 AgentTrust API Server running on port ${PORT}`);
  console.log(`📊 Loaded ${trustGraph.scores.size} existing scores`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health                  - Health check`);
  console.log(`  GET  /api/v1/score/{address} - Score wallet (free tier)`);
  console.log(`  POST /api/v1/batch/score     - Batch score (max 10)`);
  console.log(`  GET  /api/v1/stats           - API stats`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  helius.stop();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = { server, trustGraph };
