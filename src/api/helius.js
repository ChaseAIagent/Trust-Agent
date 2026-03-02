/**
 * Helius API Integration
 * Fetches Solana transaction history for wallet analysis
 */

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_BASE_URL = 'https://mainnet.helius-rpc.com';

async function fetchTransactionHistory(walletAddress, options = {}) {
  if (!HELIUS_API_KEY) {
    throw new Error('HELIUS_API_KEY not configured');
  }
  
  const { limit = 100, before = null } = options;
  
  const response = await fetch(`${HELIUS_BASE_URL}/v0/addresses/?api-key=${HELIUS_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      addresses: [walletAddress],
      limit,
      before
    })
  });
  
  if (!response.ok) {
    throw new Error(`Helius API error: ${response.status}`);
  }
  
  return await response.json();
}

module.exports = { fetchTransactionHistory };
