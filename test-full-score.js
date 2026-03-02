/**
 * Full scoring test - Performance + Security + Identity
 * Validates integration of profitability and success rate
 */

require('dotenv').config();
const { HeliusClient } = require('./src/api/helius');
const { ScoringEngine } = require('./src/scoring/engine');

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

async function testFullScore() {
  console.log('🎯 Full AgentTrust Score Test\n');
  console.log('Components: Performance (400) + Security (400) + Identity (200) = 1000');
  console.log('=' .repeat(70));

  const engine = new ScoringEngine();

  for (const wallet of TEST_WALLETS) {
    console.log(`\n📊 ${wallet.name}`);
    console.log(`   ${wallet.address}`);
    console.log('-'.repeat(70));

    try {
      const result = await engine.scoreWallet(wallet.address, {
        includeProfitability: true,
        txLimit: 100
      });

      if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
        continue;
      }

      const { score, profitability, patterns } = result;

      // Total Score
      console.log(`\n   🏆 TOTAL SCORE: ${score.total}/1000 (${score.riskLevel} risk)`);
      console.log(`   ├─ Performance: ${score.performance}/400`);
      console.log(`   ├─ Security:    ${score.security}/400`);
      console.log(`   └─ Identity:    ${score.identity}/200`);

      // Performance breakdown
      if (profitability) {
        console.log(`\n   💰 Performance Details:`);
        console.log(`      • Swap Success: ${profitability.swapMetrics?.swapSuccessRate?.toFixed(1) || 'N/A'}% (${profitability.swapMetrics?.successfulSwaps || 0}/${profitability.swapMetrics?.swapCount || 0})`);
        console.log(`      • Token Diversity: ${profitability.tokenDiversity || 0} tokens`);
        console.log(`      • Transaction Volume: ${profitability.transactionCount || 0} txns`);
        if (profitability.realizedPnL && profitability.realizedPnL !== 0) {
          console.log(`      • Realized PnL: $${profitability.realizedPnL.toFixed(2)}`);
        }
      }

      // Pattern detection
      if (patterns) {
        console.log(`\n   🛡️  Security Details:`);
        console.log(`      • Pattern Risk: ${patterns.riskLevel}`);
        console.log(`      • Security Deduction: ${patterns.securityDeduction}/400`);
        if (patterns.flags && patterns.flags.length > 0) {
          console.log(`      • Flags: ${patterns.flags.length}`);
          patterns.flags.slice(0, 3).forEach(f => {
            console.log(`        - [${f.level}] ${f.category}`);
          });
        }
      }

      // Identity breakdown
      console.log(`\n   🆔 Identity Details:`);
      console.log(`      • Account Age: ${(result.analysis.accountAge / 86400).toFixed(1)} days`);
      console.log(`      • First Activity: ${result.analysis.firstActivity ? new Date(result.analysis.firstActivity * 1000).toLocaleDateString() : 'N/A'}`);
      console.log(`      • Last Activity: ${result.analysis.lastActivity ? new Date(result.analysis.lastActivity * 1000).toLocaleDateString() : 'N/A'}`);

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Full scoring integration complete!');
}

testFullScore();
