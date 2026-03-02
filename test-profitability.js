/**
 * Test script for RPC-native profitability calculator
 * Tests with the 5 verified wallets from our research
 */

require('dotenv').config();

const { HeliusClient } = require('./src/api/helius');
const { ProfitabilityCalculator } = require('./src/scoring/profitability');
const { ScoringEngine } = require('./src/scoring/engine');

// Test wallets from our research
const TEST_WALLETS = [
  {
    address: 'EKHTbXpsm6YDgJzMkFxNU1LNXeWcUW7Ezf8mjUNQQ4Pa',
    name: 'Solana Agent Kit Treasury',
    type: 'DAO Treasury'
  },
  {
    address: '7gm6BPQrSBaTAYaJheuRevBNXcmKsgbkfBCVSjBnt9aP',
    name: 'Warp Trading Bot',
    type: 'Trading Bot'
  },
  {
    address: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
    name: 'Jupiter Perps',
    type: 'DeFi Protocol'
  },
  {
    address: '86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY',
    name: 'Helius Tutorial',
    type: 'Example Wallet'
  },
  {
    address: 'GP1TLVRBVfn5RuAZfzqRFA9dTy8EfpE76rbzZ5u2Y1n2',
    name: 'DeepSeek AI',
    type: 'AI Agent'
  }
];

async function testProfitability() {
  console.log('🧪 Testing RPC-Native Profitability Calculator\n');
  console.log('=' .repeat(60));

  try {
    const helius = new HeliusClient();
    const engine = new ScoringEngine();

    for (const wallet of TEST_WALLETS) {
      console.log(`\n📊 Testing: ${wallet.name}`);
      console.log(`   Address: ${wallet.address}`);
      console.log(`   Type: ${wallet.type}`);
      console.log('-'.repeat(60));

      try {
        // Get wallet analysis with profitability
        const analysis = await helius.analyzeWallet(wallet.address, {
          txLimit: 100,
          includeProfitability: true
        });

        if (!analysis.profitability) {
          console.log('   ⚠️ No profitability data available');
          continue;
        }

        const p = analysis.profitability;

        console.log(`   💰 Portfolio Value: $${p.currentPortfolioValue.toFixed(2)}`);
        console.log(`   📈 Total Inflows: $${p.totalInflowValue.toFixed(2)}`);
        console.log(`   📉 Total Outflows: $${p.totalOutflowValue.toFixed(2)}`);
        console.log(`   💵 Realized PnL: $${p.realizedPnL.toFixed(2)}`);
        console.log(`   📊 ROI: ${p.roi.toFixed(2)}%`);
        console.log(`   🔄 Swap Success: ${p.swapMetrics.swapSuccessRate.toFixed(1)}% (${p.swapMetrics.successfulSwaps}/${p.swapMetrics.swapCount})`);
        console.log(`   🪙 Token Diversity: ${p.tokenDiversity} unique tokens`);
        console.log(`   📋 Transactions: ${p.transactionCount}`);

        // Calculate performance score
        const calc = new ProfitabilityCalculator(helius);
        const perfScore = calc.calculatePerformanceScore(p);
        console.log(`   🎯 Performance Score: ${perfScore}/400`);

        // Show top tokens
        if (p.tokenFlows.length > 0) {
          console.log(`   🏆 Top Holdings (by net flow):`);
          const sorted = p.tokenFlows
            .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
            .slice(0, 3);
          
          sorted.forEach(tf => {
            const netFormatted = (tf.net / 1e6).toFixed(2);
            const symbol = tf.mint.slice(0, 4) + '...' + tf.mint.slice(-4);
            console.log(`      • ${symbol}: ${netFormatted > 0 ? '+' : ''}${netFormatted} tokens @ $${tf.currentPrice.toFixed(4)}`);
          });
        }

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test complete!');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run test
testProfitability();
