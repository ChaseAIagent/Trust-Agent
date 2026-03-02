/**
 * Test Cache and Rate Limiting
 */

const { AgentTrustCache } = require('./src/utils/cache');
const { RateLimiter, HeliusRateLimiter } = require('./src/utils/rate-limiter');

console.log('💀 Testing Cache & Rate Limiting\n');
console.log('='.repeat(60));

// Test 1: LRU Cache
console.log('\n📦 Testing LRU Cache...\n');

const cache = new AgentTrustCache({ maxSize: 100 });

// Simulate wallet lookups
const wallets = [
  'WarpBot123...',
  'DeepSeek456...',
  'Jupiter789...',
  'WarpBot123...', // Duplicate - should hit cache
  'NewWallet111...'
];

async function simulateLookups() {
  console.log('Simulating wallet lookups:');
  
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    const result = await cache.getScore(wallet, {}, async () => {
      // Simulate API call
      await new Promise(r => setTimeout(r, 10));
      return { score: Math.floor(Math.random() * 1000), address: wallet };
    });
    
    console.log(`  ${i+1}. ${wallet.slice(0, 15)}... - Score: ${result.score}, Cached: ${result.cached}`);
  }
  
  console.log('\n📊 Cache Stats:');
  console.log(cache.getStats());
}

simulateLookups().then(() => {
  // Test 2: Rate Limiter
  console.log('\n' + '='.repeat(60));
  console.log('\n🚦 Testing Rate Limiter\n');
  
  const limiter = new RateLimiter();
  const testIP = '192.168.1.100';
  
  console.log('Simulating 5 requests from same IP:');
  
  for (let i = 1; i <= 5; i++) {
    const result = limiter.check(testIP, 'free');
    limiter.record(testIP, 'free');
    
    console.log(`  Request ${i}: ${result.allowed ? '✅ Allowed' : '❌ Blocked'} (Remaining: ${result.remaining})`);
  }
  
  console.log('\n📊 Rate Limiter Stats:');
  console.log(limiter.getStats());
  
  // Test 3: Helius Rate Limiter
  console.log('\n' + '='.repeat(60));
  console.log('\n⚡ Testing Helius Rate Limiter\n');
  
  const heliusLimiter = new HeliusRateLimiter(10, 60000); // 10 req/min
  
  console.log('Simulating 12 rapid requests:');
  
  for (let i = 1; i <= 12; i++) {
    const result = heliusLimiter.check();
    
    if (result.allowed) {
      console.log(`  Request ${i}: ✅ Allowed (Usage: ${result.currentUsage}/${result.remaining})`);
    } else {
      console.log(`  Request ${i}: ⏳ Throttled (Wait: ${result.waitTime}ms)`);
    }
  }
  
  console.log('\n📊 Helius Limiter Stats:');
  console.log(heliusLimiter.getStats());
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ All Tests Complete\n');
  
  cache.stop();
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
