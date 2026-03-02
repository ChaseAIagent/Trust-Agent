/**
 * Test Program ID Filter
 */

const { ProgramFilter } = require('./src/utils/program-filter');

console.log('💀 Testing Program ID Filter\n');
console.log('='.repeat(60));

const filter = new ProgramFilter();

// Test 1: Known programs
console.log('\n🔍 Testing Known Programs:\n');

const testAddresses = [
  { addr: '11111111111111111111111111111111', name: 'System Program', expect: true }, // System program
  { addr: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', name: 'Token Program', expect: true }, // Token program
  { addr: 'JUP6LkbZbjS1jKKdUam6QhJxG4b3q3d6s4mLcCR4kP', name: 'Jupiter', expect: true },
  { addr: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', name: 'Orca', expect: true },
  { addr: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', name: 'Raydium', expect: true },
  { addr: 'WarpBotABC1234567890123456789012345678901234', name: 'Wallet (fake)', expect: false },
  { addr: 'UnknownXYZ789012345678901234567890123456789012', name: 'Unknown', expect: false }
];

for (const test of testAddresses) {
  const result = filter.isProgram(test.addr);
  const status = result.isProgram === test.expect || 
                 (test.expect === 'unknown' && !result.isProgram);
  
  console.log(`  ${test.name}:`);
  console.log(`    Address: ${test.addr.slice(0, 20)}...`);
  console.log(`    Is Program: ${result.isProgram} (${result.confidence})`);
  console.log(`    Expected: ${test.expect} ${status ? '✅' : '❌'}`);
  console.log();
}

// Test 2: Program info
console.log('='.repeat(60));
console.log('\n📋 Testing Program Info:\n');

const programsToCheck = [
  '11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'JUP6LkbZbjS1jKKd',
  'WarpBotABC123...'
];

for (const addr of programsToCheck) {
  const info = filter.getProgramInfo(addr);
  
  console.log(`  ${addr.slice(0, 20)}...`);
  if (info) {
    console.log(`    Name: ${info.name}`);
    console.log(`    Type: ${info.type}`);
    console.log(`    Scorable: ${info.isScorable}`);
  } else {
    console.log(`    Not a known program`);
  }
  console.log();
}

// Test 3: Validation for scoring
console.log('='.repeat(60));
console.log('\n✅ Testing Validation for Scoring:\n');

const validationTests = [
  { addr: '11111111111111111111111111111111', txCount: 0 },
  { addr: 'WarpBotABC1234567890123456789012345678901234', txCount: 150 },
  { addr: 'NewWalletNoTxsYet1234567890123456789012345', txCount: 0 }
];

for (const test of validationTests) {
  const result = filter.validateForScoring(test.addr, test.txCount);
  
  console.log(`  Address: ${test.addr.slice(0, 20)}...`);
  console.log(`    TX Count: ${test.txCount}`);
  console.log(`    Scorable: ${result.scorable} ${result.scorable ? '✅' : '⏭️'}`);
  if (!result.scorable) {
    console.log(`    Reason: ${result.reason}`);
    if (result.suggestion) {
      console.log(`    Alternative: ${result.suggestion.description}`);
    }
  }
  console.log();
}

// Test 4: Batch filtering
console.log('='.repeat(60));
console.log('\n📦 Testing Batch Filtering:\n');

const batchAddresses = [
  '11111111111111111111111111111111',  // System
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',  // Token
  'WalletABC1234567890123456789012345678901234',  // Wallet
  'JUP6LkbZbjS1jKKd',  // Jupiter
  'AnotherWallet1234567890123456789012345678901'  // Wallet
];

const txData = {
  'WalletABC1234567890123456789012345678901234': 150,
  'AnotherWallet1234567890123456789012345678901': 75
};

const filtered = filter.filterWallets(batchAddresses, txData);

console.log(`  Total: ${batchAddresses.length}`);
console.log(`  Scorable: ${filtered.scorable.length} ${filtered.scorable.map(a => a.slice(0, 10)).join(', ')}`);
console.log(`  Programs: ${filtered.programs.length} ${filtered.programs.map(p => p.programInfo?.name).join(', ')}`);
console.log(`  Unknown: ${filtered.unknown.length}`);

console.log('\n' + '='.repeat(60));
console.log('\n✅ Program Filter Test Complete\n');
