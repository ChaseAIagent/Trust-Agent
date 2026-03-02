/**
 * Test Fallback Client
 * Verifies Helius + Bitquery integration
 */

require('dotenv').config();
const { FallbackClient } = require('./src/api/fallback-client');

const TEST_WALLETS = [
  '7gm6BPQrSBaTAYaJheuRevBNXcmKsgbkfBCVSjBnt9aP',
  'GP1TLVRBVfn5RuAZfzqRFA9dTy8EfpE76rbzZ5u2Y1n2'
];

async function testFallback() {
  console.log('🔗 Testing Fallback Client (Helius + Bitquery)\n');
  console.log('=' .repeat(60));

  const client = new FallbackClient();

  // Test connections first
  console.log('\n📡 Testing connections...\n');
  const connections = await client.testConnections();
  
  console.log(`Helius:   ${connections.helius.success ? '✅' : '❌'} ${connections.helius.message || connections.helius.error}`);
  console.log(`Bitquery: ${connections.bitquery.configured ? (connections.bitquery.success ? '✅' : '❌') : '⚠️  Not configured'} ${connections.bitquery.message || connections.bitquery.error || ''}`);

  if (!connections.helius.success && !connections.bitquery.success) {
    console.log('\n❌ No data sources available. Exiting.');
    return;
  }

  // Test wallet analysis
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Testing wallet analysis:\n');

  for (const wallet of TEST_WALLETS) {
    console.log(`\n${wallet.slice(0, 20)}...`);
    console.log('-'.repeat(60));

    try {
      // Test general transactions
      console.log('  Fetching transactions...');
      const txData = await client.getTransactions(wallet, 50);
      console.log(`  ✅ Source: ${txData.source} (${txData.count} txns)`);
      if (txData.fallback) {
        console.log('  ⚠️  Used fallback');
      }

      // Test DEX data (prefer Bitquery)
      console.log('  Fetching DEX trades...');
      const dexData = await client.getDEXData(wallet, 50);
      console.log(`  ✅ Source: ${dexData.source} (${dexData.count} trades)`);
      if (dexData.isDEXData) {
        console.log('  📊 Bitquery DEX optimized');
      }

      // Show sample if available
      if (txData.transactions.length > 0) {
        const sample = txData.transactions[0];
        console.log(`  Sample: ${sample.type || 'UNKNOWN'} @ ${new Date(sample.timestamp * 1000).toLocaleDateString()}`);
      }

    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // Stats
  console.log('\n' + '='.repeat(60));
  console.log('\n📈 Usage Stats:\n');
  const stats = client.getStats();
  console.log(`  Helius calls:   ${stats.heliusCalls}`);
  console.log(`  Bitquery calls: ${stats.bitqueryCalls}`);
  console.log(`  Fallback rate:  ${stats.fallbackRate}`);

  console.log('\n✅ Fallback client test complete!');
}

testFallback().catch(console.error);
