/**
 * Test script for Success Rate Calculator
 */

require('dotenv').config();
const { HeliusClient } = require('./src/api/helius');
const { SuccessRateCalculator } = require('./src/scoring/success-rate');

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

async function testSuccessRate() {
  console.log('🎯 Testing Success Rate Calculator\n');
  console.log('=' .repeat(60));

  const helius = new HeliusClient();
  const calculator = new SuccessRateCalculator();

  for (const wallet of TEST_WALLETS) {
    console.log(`\n📊 ${wallet.name}`);
    console.log(`   ${wallet.address}`);
    console.log('-'.repeat(60));

    try {
      const signatures = await helius.getTransactionSignatures(wallet.address, 100);
      const transactions = await helius.parseTransactions(signatures.map(s => s.signature));
      
      const metrics = calculator.calculateSuccessMetrics(transactions);
      const securityScore = calculator.calculateSecurityScore(metrics);
      const riskFlags = calculator.getRiskFlags(metrics);

      console.log(`   ✅ Success Rate: ${metrics.overall.rate.toFixed(1)}% (${metrics.overall.success}/${metrics.overall.total})`);
      console.log(`   📈 Recent (24h): ${metrics.recentTrend.rate24h.toFixed(1)}%`);
      console.log(`   📈 Recent (7d): ${metrics.recentTrend.rate7d.toFixed(1)}%`);
      console.log(`   🔥 Max Consecutive Failures: ${metrics.maxConsecutiveFailures}`);
      console.log(`   ♻️ Recovery Rate: ${metrics.recoveryRate.toFixed(1)}%`);
      console.log(`   🛡️ Security Score (from success): ${securityScore}/150`);

      if (metrics.failurePatterns.length > 0) {
        console.log(`   ⚠️ Top Failures:`);
        metrics.failurePatterns.slice(0, 3).forEach(f => {
          console.log(`      • ${f.code}: ${f.count}x`);
        });
      }

      if (riskFlags.length > 0) {
        console.log(`   🚩 Risk Flags:`);
        riskFlags.forEach(flag => {
          console.log(`      [${flag.level}] ${flag.reason}: ${flag.value}`);
        });
      } else {
        console.log(`   ✅ No risk flags`);
      }

      // By type breakdown
      const byType = Object.entries(metrics.byType)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5);
      
      if (byType.length > 0) {
        console.log(`   📋 Top Transaction Types:`);
        byType.forEach(([type, data]) => {
          console.log(`      • ${type}: ${data.success}/${data.total} (${data.rate.toFixed(0)}%)`);
        });
      }

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(60));
}

testSuccessRate();
