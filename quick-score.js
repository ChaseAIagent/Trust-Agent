const { ScoringEngine } = require('./src/scoring/engine');
const { HeliusClient } = require('./src/api/helius');

const wallets = [
  '4cSvhQWYomj5i5utYK2fgHJUTKa7TskR9FMzhf7D6DoA',
  'FonDhhZjC6MgfxuFmkhuDKE1TSdLV49BZGMGTDEhyC86',
  'tYGCfzdZTXEkG9rvbxUH8f8AgGmPRNDdMPkR1ERcCu8',
  '8seyM3fSjwifWe59mpW8LeH2FSuBNbZVaqbvRddPAqrK',
  '77G5SpvcrZehWyQfH6E9K2pnWivD3iAKD5frVFL22UQk'
];

async function run() {
  console.log('💀 SCORING 5 WALLETS\n');
  const helius = new HeliusClient();
  const engine = new ScoringEngine(helius);
  
  for (const addr of wallets) {
    console.log(`\n${addr}`);
    console.log('-'.repeat(60));
    try {
      const r = await engine.scoreWallet(addr, { txLimit: 100, includePatterns: true });
      console.log(`Score: ${r.score}/1000 (${r.patterns?.riskLevel || 'UNKNOWN'})`);
      console.log(`Balance: ${r.analysis?.balance?.toFixed(4) || 0} SOL | TXs: ${r.analysis?.transactionCount || 0}`);
      if (r.patterns?.riskFlags?.length) {
        console.log(`Flags (${r.patterns.riskFlags.length}):`);
        r.patterns.riskFlags.forEach(f => console.log(`  - [${f.level}] ${f.category}: ${f.reason}`));
      }
    } catch(e) {
      console.log(`Error: ${e.message}`);
    }
  }
  console.log('\n✅ Done');
}
run();
