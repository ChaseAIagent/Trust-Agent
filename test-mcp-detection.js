/**
 * MCP Threat Detection Test
 * Validates AI agent token deployment detection
 */

const { MCPDetection } = require('./src/scoring/mcp-detection');

console.log('💀 MCP THREAT DETECTION TEST\n');
console.log('='.repeat(70));

const mcpDetector = new MCPDetection();

// Test 1: MCP Stats
console.log('\n📊 Initial MCP Stats:');
const stats = mcpDetector.getMCPStats();
console.log(`   Known Creators: ${stats.knownCreators}`);
console.log(`   Known Tokens: ${stats.knownTokens}`);
console.log(`   Programs Tracked: ${stats.programsTracked}`);

// Test 2: Simulate MCP deployment transaction
console.log('\n🤖 Simulating MCP Deployment Transaction...');

const now = Math.floor(Date.now() / 1000);

const mockMCPTransaction = {
  signature: '5HXs3QyN2NcdWgG3GymdVKdC2cRifkDpmZHMgKqB6yX7...',
  timestamp: now - 200,
  programInstructions: [{
    programId: 'PRINTRxuF2KriZr7iC5ALd9vTgZBF4xVYU4eis5PnPc',
    accounts: ['TokenMintAddress123456789...', 'DeployerWallet...'],
    data: 'create_token...'
  }],
  tokenTransfers: [{
    mint: 'NEWTOKEN123456789...',
    fromUserAccount: null,
    toUserAccount: 'DeployerWallet...',
    tokenAmount: 1000000
  }]
};

const mockTransactions = [mockMCPTransaction];
const testWallet = 'DeployerWalletABC123...';

// Test MCP creator detection
const creatorThreats = mcpDetector.detectMCPCreator(testWallet, mockTransactions);
console.log(`   Threats Detected: ${creatorThreats.length}`);

if (creatorThreats.length > 0) {
  console.log(`\n   🚨 MCP CREATOR FLAG:`);
  console.log(`      Level: ${creatorThreats[0].level}`);
  console.log(`      Category: ${creatorThreats[0].category}`);
  console.log(`      Description: ${creatorThreats[0].description}`);
  console.log(`      Token: ${creatorThreats[0].tokenAddress}`);
}

// Test 3: Simulate MCP trading
console.log('\n💱 Simulating MCP Token Trading...');

const mockTradingTx = {
  signature: 'TradeTx456789...',
  timestamp: now - 150,
  tokenTransfers: [{
    mint: 'NEWTOKEN123456789...', // Same token from deployment
    fromUserAccount: 'TraderWallet...',
    toUserAccount: 'DEXPool...',
    tokenAmount: 5000
  }]
};

// Add token to known MCP tokens
mcpDetector.addKnownMCPToken('NEWTOKEN123456789...', 'test');

const tradingThreats = mcpDetector.detectMCPTrader('TraderWallet...', [mockTradingTx]);
console.log(`   Trading Threats: ${tradingThreats.length}`);

if (tradingThreats.length > 0) {
  console.log(`\n   ⚠️  MCP TRADER FLAG:`);
  console.log(`      Level: ${tradingThreats[0].level}`);
  console.log(`      Category: ${tradingThreats[0].category}`);
}

// Test 4: Rapid deployment pattern
console.log('\n⚡ Testing Rapid Deployment Detection...');

const rapidTxs = [
  { signature: 'Tx1...', timestamp: now - 100, tokenTransfers: [{ mint: 'TOKEN1' }] },
  { signature: 'Tx2...', timestamp: now - 90, tokenTransfers: [{ mint: 'TOKEN1' }] },
  { signature: 'Tx3...', timestamp: now - 80, tokenTransfers: [{ mint: 'TOKEN1' }] },
  { signature: 'Tx4...', timestamp: now - 70, tokenTransfers: [{ mint: 'TOKEN1' }] },
];

const rapidThreats = mcpDetector.detectRapidDeployment(rapidTxs);
console.log(`   Rapid Deployment Threats: ${rapidThreats.length}`);

if (rapidThreats.length > 0) {
  console.log(`\n   🚨 RAPID LAUNCH FLAG:`);
  console.log(`      Level: ${rapidThreats[0].level}`);
  console.log(`      Description: ${rapidThreats[0].description}`);
}

// Test 5: Full detection flow
console.log('\n🔍 Full MCP Detection Flow...');

async function testFullDetection() {
  const testAddress = 'TestWalletForMCP123...';
  const allTxs = [mockMCPTransaction, ...rapidTxs];
  
  const result = await mcpDetector.detectMCPThreats(testAddress, allTxs, { lookbackDays: 30 });
  
  console.log(`\n   Detection Results:`);
  console.log(`      Total Threats: ${result.threats.length}`);
  console.log(`      MCP Risk Score: ${result.mcpRiskScore}/100`);
  console.log(`      Is MCP Creator: ${result.summary.isMCPCreator}`);
  console.log(`      Trades MCP: ${result.summary.tradesMCP}`);
  console.log(`      MCP Tokens Created: ${result.summary.mcpTokensCreated}`);
  console.log(`      MCP Tokens Traded: ${result.summary.mcpTokensTraded}`);
  
  if (result.threats.length > 0) {
    console.log(`\n   📋 All Threats:`);
    result.threats.forEach((threat, i) => {
      console.log(`      ${i+1}. [${threat.level}] ${threat.category}`);
      console.log(`         ${threat.description}`);
    });
  }
  
  return result;
}

testFullDetection().then(result => {
  console.log('\n' + '='.repeat(70));
  console.log('\n✅ MCP Detection Test Complete\n');
  
  // Final stats
  console.log('📊 Updated MCP Stats:');
  const finalStats = mcpDetector.getMCPStats();
  console.log(`   Known Creators: ${finalStats.knownCreators}`);
  console.log(`   Known Tokens: ${finalStats.knownTokens}`);
  
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
