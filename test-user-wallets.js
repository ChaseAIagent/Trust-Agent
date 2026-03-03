/**
 * Test User-Provided Wallets
 */

const { ScoringEngine } = require('./src/scoring/engine');
const { HeliusClient } = require('./src/api/helius');

const wallets = [
  { address: '4cSvhQWYomj5i5utYK2fgHJUTKa7TskR9FMzhf7D6DoA', category: 'user_provided_1' },
  { address: 'FonDhhZjC6MgfxuFmkhuDKE1TSdLV49BZGMGTDEhyC86', category: 'user_provided_2' },
  { address: 'tYGCfzdZTXEkG9rvbxUH8f8AgGmPRNDdMPkR1ERcCu8', category: 'user_provided_3' },
  { address: '8seyM3fSjwifWe59mpW8LeH2FSuBNbZVaqbvRddPAqrK', category: 'user_provided_4' },
  { address: '77G5SpvcrZehWyQfH6E9K2pnWivD3iAKD5frVFL22UQk', category: 'user_provided_5' }
];

async function testUserWallets() {
  console.log('💀 SCORING USER WALLETS\n');
  console.log('='.repeat(70));
  
  const helius = new HeliusClient();
  const engine = new ScoringEngine(helius);
  
  const results = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    console.log(`\n📊 Testing ${i + 1}/${wallets.length}: ${wallet.address.slice(0, 20)}...`);
    
    try {
      const start = Date.now();
      const result = await engine.scoreWallet(wallet.address, {
        txLimit: 100,
        includePatterns: true
      });
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      
      results.push({
        address: wallet.address,
        category: wallet.category,
        score: result.score,
        duration: parseFloat(duration),
        riskLevel: result.patterns?.riskLevel || 'UNKNOWN',
        flags: result.patterns?.flags?.length || 0,
        breakdown: {
          performance: result.score?.performance || 0,
          security: result.score?.security || 0,
          identity: result.score?.identity || 0
        }
      });
      
      console.log(`   Score: ${result.score}/1000 (${result.patterns?.riskLevel || 'UNKNOWN'})`);
      console.log(`   Flags: ${result.patterns?.flags?.length || 0}`);
      console.log(`   Duration: ${duration}s`);
      
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      results.push({
        address: wallet.address,
        category: wallet.category,
        error: err.message
      });
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 SUMMARY\n');
  
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  
  if (successful.length > 0) {
    const avgScore = successful.reduce((a, b) => a + b.score, 0) / successful.length;
    const riskDistribution = successful.reduce((acc, r) => {
      acc[r.riskLevel] = (acc[r.riskLevel] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`Scored: ${successful.length}/${wallets.length}`);
    console.log(`Average Score: ${avgScore.toFixed(0)}/1000`);
    console.log(`Risk Distribution:`, riskDistribution);
    console.log(`\nTop Scores:`);
    successful.sort((a, b) => b.score - a.score).slice(0, 5).forEach((r, i) => {
      console.log(`  ${i+1}. ${r.address.slice(0, 20)}... - ${r.score}/1000 (${r.riskLevel})`);
    });
  }
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => console.log(`   ${r.address.slice(0, 20)}... - ${r.error}`));
  }
  
  // Save results
  const fs = require('fs');
  const filename = `user-wallet-results-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\n💾 Results saved to: ${filename}`);
  
  console.log('\n' + '='.repeat(70));
  console.log('\n✅ User Wallet Testing Complete\n');
}

testUserWallets().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
