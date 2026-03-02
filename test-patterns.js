/**
 * Test script for Pattern Detection
 */

require('dotenv').config();
const { HeliusClient } = require('./src/api/helius');
const { PatternDetector } = require('./src/scoring/pattern-detection');

const TEST_WALLETS = [
  {
    address: '7gm6BPQrSBaTAYaJheuRevBNXcmKsgbkfBCVSjBnt9aP',
    name: 'Warp Trading Bot'
  },
  {
    address: 'GP1TLVRBVfn5RuAZfzqRFA9dTy8EfpE76rbzZ5u2Y1n2',
    name: 'DeepSeek AI'
  }
];

async function testPatterns() {
  console.log('🔍 Testing Pattern Detection\n');
  console.log('=' .repeat(60));

  const helius = new HeliusClient();
  const detector = new PatternDetector();

  for (const wallet of TEST_WALLETS) {
    console.log(`\n📊 ${wallet.name}`);
    console.log(`   ${wallet.address}`);
    console.log('-'.repeat(60));

    try {
      const analysis = await helius.analyzeWallet(wallet.address, { txLimit: 100 });
      const signatures = await helius.getTransactionSignatures(wallet.address, 100);
      const transactions = await helius.parseTransactions(signatures.map(s => s.signature));
      
      const patterns = detector.detectPatterns(wallet.address, transactions, analysis.balance);
      const summary = detector.getSummary(patterns);

      console.log(`   🚨 Risk Level: ${summary.riskLevel}`);
      console.log(`   📉 Security Deduction: ${summary.securityDeduction}/400`);
      console.log(`   🚩 Total Flags: ${summary.flagCount}`);
      
      if (summary.criticalIssues > 0) {
        console.log(`   🔴 Critical: ${summary.criticalIssues}`);
      }
      if (summary.highIssues > 0) {
        console.log(`   🟠 High: ${summary.highIssues}`);
      }

      if (patterns.largeOutflows.count > 0) {
        console.log(`   💸 Large Outflows: ${patterns.largeOutflows.count} detected`);
        patterns.largeOutflows.events.slice(-3).forEach(e => {
          console.log(`      • ${e.severity}: ${e.percentOfBalance.toFixed(1)}% of balance`);
        });
      }

      if (patterns.velocitySpikes.hasVelocitySpike) {
        console.log(`   ⚡ Velocity Spikes: ${patterns.velocitySpikes.spikeCount}`);
        console.log(`      Avg: ${patterns.velocitySpikes.averageVelocity.toFixed(1)} tx/hr, Max: ${patterns.velocitySpikes.maxVelocity}`);
      }

      if (patterns.mevActivity.hasMEVActivity) {
        console.log(`   🤖 MEV Activity: ${patterns.mevActivity.mevTransactionCount} tx, ${patterns.mevActivity.sandwichPatterns} sandwiches`);
      }

      if (patterns.washTrading.hasWashTrading) {
        console.log(`   🔄 Wash Trading: ${patterns.washTrading.washTradeCount} pairs detected`);
      }

      if (patterns.riskFlags.length > 0) {
        console.log(`   📋 Risk Flags:`);
        patterns.riskFlags.forEach(flag => {
          const icon = flag.level === 'CRITICAL' ? '🔴' : flag.level === 'HIGH' ? '🟠' : '🟡';
          console.log(`      ${icon} [${flag.level}] ${flag.category}: ${flag.reason}`);
        });
      } else {
        console.log(`   ✅ No risk flags`);
      }

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(60));
}

testPatterns();
