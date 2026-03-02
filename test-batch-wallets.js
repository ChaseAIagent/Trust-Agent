/**
 * Batch Wallet Testing - Grimm's Scale Validation
 * Tests diverse wallets across categories
 */

require('dotenv').config();
const { ScoringEngine } = require('./src/scoring/engine');
const fs = require('fs');

// Curated test wallets - mix of real addresses
const TEST_WALLETS = [
  // AI Trading Bots (known performers)
  {
    address: '7gm6BPQrSBaTAYaJheuRevBNXcmKsgbkfBCVSjBnt9aP',
    name: 'Warp Trading Bot',
    category: 'ai_bot',
    expected: 'medium_high'
  },
  {
    address: 'GP1TLVRBVfn5RuAZfzqRFA9dTy8EfpE76rbzZ5u2Y1n2',
    name: 'DeepSeek AI',
    category: 'ai_bot',
    expected: 'medium'
  },
  
  // Solana Core Programs (system level - high activity, no tokens)
  {
    address: '11111111111111111111111111111111',
    name: 'System Program',
    category: 'system',
    expected: 'high_activity_no_tokens'
  },
  {
    address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    name: 'Token Program',
    category: 'system',
    expected: 'high_activity'
  },
  
  // DeFi Protocols
  {
    address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZow5BAxZyFt',
    name: 'Jupiter Aggregator',
    category: 'protocol',
    expected: 'high'
  },
  {
    address: '6EF8rrectkR5sYh9kj8mZ6fbGmfoK8Ns9Fs2f1yR2wA',
    name: 'Raydium AMM',
    category: 'protocol',
    expected: 'high'
  },
  
  // Jupiter Fee Vault (active treasury)
  {
    address: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhNU5GhxoN9vG',
    name: 'Jupiter Fee Vault',
    category: 'treasury',
    expected: 'high'
  },
  
  // Test new/minimal wallets
  {
    address: 'G5397j5n7GxeKzLvQ73e9tfZ8t7yP9rG5sTvU2wX3yZ5',
    name: 'Fresh Wallet Test',
    category: 'new',
    expected: 'low'
  }
];

async function runBatchTest() {
  console.log('💀 GRIMM BATCH VALIDATION\n');
  console.log('='.repeat(70));
  console.log(`Testing ${TEST_WALLETS.length} wallets...\n`);
  
  const results = [];
  const startTime = Date.now();
  
  for (let i = 0; i < TEST_WALLETS.length; i++) {
    const wallet = TEST_WALLETS[i];
    console.log(`\n[${i + 1}/${TEST_WALLETS.length}] ${wallet.name}`);
    console.log(`Address: ${wallet.address.slice(0, 16)}... | Category: ${wallet.category}`);
    console.log('-'.repeat(60));
    
    try {
      const engine = new ScoringEngine();
      const score = await engine.scoreWallet(wallet.address, {
        includePatterns: true,
        includeProfitability: true,
        txLimit: 100
      });
      
      const result = {
        ...wallet,
        total: score.score?.total ?? 0,
        performance: score.score?.performance ?? 0,
        security: score.score?.security ?? 0,
        identity: score.score?.identity ?? 0,
        riskLevel: score.score?.riskLevel ?? 'ERROR',
        txCount: score.analysis?.transactionCount ?? 0,
        flags: score.patterns?.flags?.length || 0,
        flagDetails: score.patterns?.flags?.map(f => `${f.level}:${f.category}`) || [],
        success: true,
        error: null
      };
      
      results.push(result);
      
      const bar = '█'.repeat(Math.floor(result.total / 100)) + '░'.repeat(10 - Math.floor(result.total / 100));
      console.log(`✅ ${bar} ${result.total}/1000 (${result.riskLevel})`);
      console.log(`   P:${result.performance} S:${result.security} I:${result.identity} | TX:${result.txCount}`);
      if (result.flags > 0) {
        console.log(`   ⚠️  ${result.flags} flags: ${result.flagDetails.slice(0, 2).join(', ')}${result.flagDetails.length > 2 ? '...' : ''}`);
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      results.push({
        ...wallet,
        total: 0,
        performance: 0,
        security: 0,
        identity: 0,
        riskLevel: 'ERROR',
        txCount: 0,
        flags: 0,
        flagDetails: [],
        success: false,
        error: error.message
      });
    }
    
    // Rate limiting - 1.5s between requests
    if (i < TEST_WALLETS.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  
  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 BATCH VALIDATION SUMMARY\n');
  console.log(`Duration: ${duration}s | Success: ${successful}/${TEST_WALLETS.length} | Failed: ${failed}`);
  
  const successfulResults = results.filter(r => r.success && r.total > 0);
  if (successfulResults.length > 0) {
    const avgScore = (successfulResults.reduce((a, r) => a + r.total, 0) / successfulResults.length).toFixed(0);
    console.log(`Average Score: ${avgScore}/1000`);
    
    // Risk distribution
    console.log('\n🚨 Risk Distribution:');
    const riskDist = {};
    successfulResults.forEach(r => { riskDist[r.riskLevel] = (riskDist[r.riskLevel] || 0) + 1; });
    Object.entries(riskDist).forEach(([level, count]) => console.log(`   ${level}: ${count}`));
    
    // Category breakdown
    console.log('\n📁 Category Averages:');
    const cats = [...new Set(successfulResults.map(r => r.category))];
    cats.forEach(cat => {
      const catRes = successfulResults.filter(r => r.category === cat);
      const catAvg = (catRes.reduce((a, r) => a + r.total, 0) / catRes.length).toFixed(0);
      console.log(`   ${cat}: ${catAvg} (${catRes.length} wallets)`);
    });
  }
  
  // Save results
  const outputFile = `batch-results-${Date.now()}.json`;
  fs.writeFileSync(outputFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    duration,
    totalWallets: TEST_WALLETS.length,
    successful,
    failed,
    results
  }, null, 2));
  
  console.log(`\n💾 Results saved: ${outputFile}`);
  console.log('='.repeat(70));
  
  return results;
}

runBatchTest().catch(console.error);
