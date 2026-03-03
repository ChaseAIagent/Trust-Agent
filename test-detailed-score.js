/**
 * Detailed Scoring Report for User Wallets
 */

const { ScoringEngine } = require('./src/scoring/engine');
const { HeliusClient } = require('./src/api/helius');

const wallets = [
  '4cSvhQWYomj5i5utYK2fgHJUTKa7TskR9FMzhf7D6DoA',
  'FonDhhZjC6MgfxuFmkhuDKE1TSdLV49BZGMGTDEhyC86',
  'tYGCfzdZTXEkG9rvbxUH8f8AgGmPRNDdMPkR1ERcCu8',
  '8seyM3fSjwifWe59mpW8LeH2FSuBNbZVaqbvRddPAqrK',
  '77G5SpvcrZehWyQfH6E9K2pnWivD3iAKD5frVFL22UQk'
];

async function detailedScoring() {
  console.log('💀 DETAILED WALLET SCORING REPORT\n');
  console.log('='.repeat(80));
  
  const helius = new HeliusClient();
  const engine = new ScoringEngine(helius);
  
  for (let i = 0; i < wallets.length; i++) {
    const address = wallets[i];
    console.log(`\n\n🔍 WALLET ${i + 1}: ${address}`);
    console.log('-'.repeat(80));
    
    try {
      const result = await engine.scoreWallet(address, {
        txLimit: 100,
        includePatterns: true
      });
      
      // Overall Score
      console.log('\n📊 OVERALL SCORE');
      console.log(`   Total: ${result.score}/1000`);
      if (result.scoreBreakdown) {
        console.log(`   Performance: ${result.scoreBreakdown.performance}/400`);
        console.log(`   Security: ${result.scoreBreakdown.security}/400`);
        console.log(`   Identity: ${result.scoreBreakdown.identity}/200`);
      }
      console.log(`   Risk Level: ${result.patterns?.riskLevel || 'UNKNOWN'}`);
      
      // Wallet Analysis
      if (result.analysis) {
        console.log('\n📈 WALLET ANALYSIS');
        console.log(`   Balance: ${result.analysis.balance?.toFixed(4) || 0} SOL`);
        console.log(`   Transaction Count: ${result.analysis.transactionCount || 0}`);
        console.log(`   Account Age: ${result.analysis.accountAge ? (result.analysis.accountAge / 86400).toFixed(1) + ' days' : 'N/A'}`);
      }
      
      // Patterns & Flags
      if (result.patterns) {
        console.log('\n🚨 RISK FLAGS');
        if (result.patterns.riskFlags && result.patterns.riskFlags.length > 0) {
          result.patterns.riskFlags.forEach((flag, idx) => {
            console.log(`   ${idx + 1}. [${flag.level}] ${flag.category}`);
            console.log(`      ${flag.reason}`);
            if (flag.details) console.log(`      Details: ${flag.details}`);
          });
        } else {
          console.log('   No risk flags detected');
        }
        
        console.log('\n🔎 PATTERN ANALYSIS');
        console.log(`   Security Deduction: ${result.patterns.securityDeduction || 0} points`);
        
        if (result.patterns.largeOutflows) {
          console.log(`   Large Outflows: ${result.patterns.largeOutflows.count || 0} events`);
        }
        if (result.patterns.mevActivity) {
          console.log(`   MEV Activity: ${result.patterns.mevActivity.hasMEVActivity ? 'YES' : 'NO'}`);
        }
        if (result.patterns.velocitySpikes) {
          console.log(`   Velocity Spikes: ${result.patterns.velocitySpikes.hasVelocitySpike ? 'YES' : 'NO'}`);
        }
        if (result.patterns.washTrading) {
          console.log(`   Wash Trading: ${result.patterns.washTrading.hasWashTrading ? 'YES' : 'NO'}`);
        }
        if (result.patterns.concentrationRisk) {
          console.log(`   Concentration Risk: ${result.patterns.concentrationRisk.highConcentration ? 'YES' : 'NO'}`);
        }
      }
      
      // Summary Interpretation
      console.log('\n💡 INTERPRETATION');
      let interpretation = '';
      if (result.score >= 800) {
        interpretation = 'VERY LOW RISK - Established, trustworthy wallet';
      } else if (result.score >= 600) {
        interpretation = 'LOW RISK - Good history, minimal concerns';
      } else if (result.score >= 400) {
        interpretation = 'MEDIUM RISK - Some concerns, investigate further';
      } else if (result.score >= 200) {
        interpretation = 'HIGH RISK - Multiple red flags, exercise caution';
      } else {
        interpretation = 'CRITICAL RISK - Likely malicious, avoid interaction';
      }
      console.log(`   ${interpretation}`);
      
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
    }
    
    console.log('\n' + '='.repeat(80));
  }
  
  console.log('\n\n✅ Detailed Scoring Complete\n');
}

detailedScoring().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
