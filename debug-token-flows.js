/**
 * Debug token flow detection for specific wallet
 */

require('dotenv').config();
const { HeliusClient } = require('./src/api/helius');

const TEST_WALLET = '7gm6BPQrSBaTAYaJheuRevBNXcmKsgbkfBCVSjBnt9aP'; // Warp Trading Bot

async function debugTokenFlows() {
  console.log('🔍 Debugging Token Flows for Warp Trading Bot\n');
  console.log('=' .repeat(60));

  try {
    const helius = new HeliusClient();
    
    // Get and parse transactions
    const signatures = await helius.getTransactionSignatures(TEST_WALLET, 20);
    console.log(`Found ${signatures.length} signatures`);
    
    if (signatures.length === 0) {
      console.log('No transactions found');
      return;
    }

    const parsedTxs = await helius.parseTransactions(signatures.map(s => s.signature));
    
    let totalTokenTransfers = 0;
    const tokenMints = new Set();
    const transfersInvolvingWallet = [];

    for (const tx of parsedTxs) {
      if (tx.tokenTransfers && Array.isArray(tx.tokenTransfers)) {
        for (const transfer of tx.tokenTransfers) {
          totalTokenTransfers++;
          tokenMints.add(transfer.mint);
          
          const involvesWallet = 
            transfer.fromUserAccount === TEST_WALLET || 
            transfer.toUserAccount === TEST_WALLET;
          
          if (involvesWallet) {
            transfersInvolvingWallet.push({
              mint: transfer.mint,
              amount: transfer.tokenAmount,
              from: transfer.fromUserAccount?.slice(0, 8) + '...',
              to: transfer.toUserAccount?.slice(0, 8) + '...',
              direction: transfer.toUserAccount === TEST_WALLET ? 'IN' : 'OUT'
            });
          }
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`  Total token transfers in txs: ${totalTokenTransfers}`);
    console.log(`  Unique token mints: ${tokenMints.size}`);
    console.log(`  Transfers involving wallet: ${transfersInvolvingWallet.length}`);
    
    if (transfersInvolvingWallet.length > 0) {
      console.log(`\n🔄 Sample transfers involving wallet:`);
      transfersInvolvingWallet.slice(0, 10).forEach((t, i) => {
        console.log(`  ${i+1}. ${t.direction}: ${t.amount} tokens`);
        console.log(`     Mint: ${t.mint.slice(0, 16)}...`);
        console.log(`     From: ${t.from} → To: ${t.to}`);
      });
    } else {
      console.log(`\n⚠️ No transfers found involving this wallet!`);
      console.log(`  Expected wallet: ${TEST_WALLET.slice(0, 16)}...`);
      
      // Show sample of what we found
      console.log(`\n🔍 Sample transfers from first tx:`);
      if (parsedTxs[0]?.tokenTransfers?.length > 0) {
        parsedTxs[0].tokenTransfers.slice(0, 3).forEach((t, i) => {
          console.log(`  ${i+1}. Amount: ${t.tokenAmount}`);
          console.log(`     From: ${t.fromUserAccount?.slice(0, 16) || 'N/A'}...`);
          console.log(`     To: ${t.toUserAccount?.slice(0, 16) || 'N/A'}...`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debugTokenFlows();
