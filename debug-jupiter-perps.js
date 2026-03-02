/**
 * Debug Jupiter Perps token detection
 */

require('dotenv').config();
const { HeliusClient } = require('./src/api/helius');

const TEST_WALLET = '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4';

async function debugJupiterPerps() {
  console.log('🔍 Debugging Jupiter Perps Token Detection\n');
  
  const helius = new HeliusClient();
  const signatures = await helius.getTransactionSignatures(TEST_WALLET, 10);
  console.log(`Found ${signatures.length} transactions`);
  
  if (signatures.length === 0) return;

  const parsedTxs = await helius.parseTransactions(signatures.map(s => s.signature));
  
  let viaAccountData = 0;
  let viaTransfers = 0;
  const mintsFromAccount = new Set();
  const mintsFromTransfers = new Set();

  for (const tx of parsedTxs) {
    // Method 1: accountData.tokenBalanceChanges
    if (tx.accountData) {
      const walletAccount = tx.accountData.find(ad => ad.account === TEST_WALLET);
      if (walletAccount?.tokenBalanceChanges?.length > 0) {
        viaAccountData++;
        walletAccount.tokenBalanceChanges.forEach(tbc => {
          mintsFromAccount.add(tbc.mint);
        });
      }
    }
    
    // Method 2: tokenTransfers
    if (tx.tokenTransfers?.length > 0) {
      for (const tt of tx.tokenTransfers) {
        if (tt.fromUserAccount === TEST_WALLET || tt.toUserAccount === TEST_WALLET) {
          viaTransfers++;
          mintsFromTransfers.add(tt.mint);
        }
      }
    }
  }

  console.log(`\n✅ Token balance changes via accountData: ${viaAccountData} txs`);
  console.log(`   Mints: ${[...mintsFromAccount].slice(0, 5).join(', ')}${mintsFromAccount.size > 5 ? '...' : ''}`);
  
  console.log(`\n✅ Token transfers matching wallet: ${viaTransfers} txs`);
  console.log(`   Mints: ${[...mintsFromTransfers].slice(0, 5).join(', ')}${mintsFromTransfers.size > 5 ? '...' : ''}`);
  
  // Check first tx structure
  console.log(`\n📄 First tx keys: ${Object.keys(parsedTxs[0] || {}).join(', ')}`);
  if (parsedTxs[0]?.accountData) {
    const wa = parsedTxs[0].accountData.find(ad => ad.account === TEST_WALLET);
    console.log(`   Wallet in accountData: ${wa ? 'YES' : 'NO'}`);
    if (wa) {
      console.log(`   nativeBalanceChange: ${wa.nativeBalanceChange}`);
      console.log(`   tokenBalanceChanges: ${wa.tokenBalanceChanges?.length || 0}`);
    }
  }
}

debugJupiterPerps().catch(console.error);
