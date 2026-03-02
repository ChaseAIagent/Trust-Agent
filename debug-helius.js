/**
 * Debug script to inspect Helius Enhanced API response format
 */

require('dotenv').config();
const { HeliusClient } = require('./src/api/helius');

const TEST_WALLET = '7gm6BPQrSBaTAYaJheuRevBNXcmKsgbkfBCVSjBnt9aP'; // Warp Trading Bot

async function debugHelius() {
  console.log('🔍 Debugging Helius Enhanced API Response\n');
  console.log('=' .repeat(60));

  try {
    const helius = new HeliusClient();
    
    // Get signatures
    const signatures = await helius.getTransactionSignatures(TEST_WALLET, 5);
    console.log(`Found ${signatures.length} signatures`);
    
    if (signatures.length === 0) {
      console.log('No transactions found');
      return;
    }

    // Parse first transaction
    const sig = signatures[0].signature;
    console.log(`\nParsing transaction: ${sig.slice(0, 20)}...`);
    
    const parsedTxs = await helius.parseTransactions([sig]);
    const tx = parsedTxs[0];
    
    console.log('\n📋 Transaction Structure:');
    console.log('  Keys:', Object.keys(tx).join(', '));
    
    // Check for token balance changes
    console.log('\n🔍 Checking tokenBalanceChanges:');
    if (tx.tokenBalanceChanges) {
      console.log(`  Found ${tx.tokenBalanceChanges.length} entries`);
      console.log('  Sample:', JSON.stringify(tx.tokenBalanceChanges[0], null, 2));
    } else {
      console.log('  ❌ NOT FOUND - checking alternatives...');
      
      // Check other possible fields
      const possibleFields = [
        'tokenTransfers',
        'tokenBalanceChange',
        'balanceChanges',
        'nativeBalanceChanges',
        'accountData'
      ];
      
      for (const field of possibleFields) {
        if (tx[field]) {
          console.log(`  ✅ Found: ${field}`);
          console.log(`     Type: ${Array.isArray(tx[field]) ? 'array' : typeof tx[field]}`);
          if (Array.isArray(tx[field]) && tx[field].length > 0) {
            console.log('     Sample:', JSON.stringify(tx[field][0], null, 2));
          }
        }
      }
    }

    // Check account data structure
    console.log('\n🔍 Checking accountData:');
    if (tx.accountData) {
      console.log(`  Found ${tx.accountData.length} accounts`);
      console.log('  Sample:', JSON.stringify(tx.accountData[0], null, 2));
    }

    // Check token transfers
    console.log('\n🔍 Checking tokenTransfers:');
    if (tx.tokenTransfers) {
      console.log(`  Found ${tx.tokenTransfers.length} transfers`);
      console.log('  Sample:', JSON.stringify(tx.tokenTransfers[0], null, 2));
    }

    // Full transaction for reference
    console.log('\n📄 Full Transaction (first 3 keys):');
    const preview = {};
    Object.keys(tx).slice(0, 3).forEach(key => {
      preview[key] = tx[key];
    });
    console.log(JSON.stringify(preview, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

debugHelius();
