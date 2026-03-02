/**
 * RPC-Native Profitability Calculator
 * Calculates PnL from Helius transaction data using on-chain balance changes
 * 
 * Uses Helius Enhanced API fields:
 * - tokenTransfers: array of token transfers with fromUserAccount, toUserAccount, tokenAmount, mint
 * - nativeTransfers: array of SOL transfers
 * - accountData[].nativeBalanceChange: SOL balance change per account
 */

const JUPITER_PRICE_API = 'https://api.jup.ag/price/v2';

class ProfitabilityCalculator {
  constructor(heliusClient) {
    this.helius = heliusClient;
    this.priceCache = new Map();
  }

  /**
   * Get current token price from Jupiter
   */
  async getTokenPrice(mint) {
    // Check cache first (5 minute TTL)
    const cached = this.priceCache.get(mint);
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.price;
    }

    try {
      const response = await fetch(`${JUPITER_PRICE_API}?ids=${mint}`);
      const data = await response.json();
      const priceData = data.data || {};
      const tokenData = priceData[mint];
      const price = tokenData && tokenData.price ? parseFloat(tokenData.price) : 0;
      
      this.priceCache.set(mint, { price, timestamp: Date.now() });
      return price;
    } catch (error) {
      console.error(`Failed to fetch price for ${mint}:`, error.message);
      return 0;
    }
  }

  /**
   * Batch fetch token prices
   */
  async getTokenPrices(mints) {
    const uniqueMints = [...new Set(mints)];
    const prices = {};
    
    // Check cache first
    const toFetch = uniqueMints.filter(mint => {
      const cached = this.priceCache.get(mint);
      if (cached && Date.now() - cached.timestamp < 300000) {
        prices[mint] = cached.price;
        return false;
      }
      return true;
    });

    if (toFetch.length === 0) return prices;

    // Fetch in batches of 100
    const batchSize = 100;
    for (let i = 0; i < toFetch.length; i += batchSize) {
      const batch = toFetch.slice(i, i + batchSize);
      try {
        const response = await fetch(`${JUPITER_PRICE_API}?ids=${batch.join(',')}`);
        const data = await response.json();
        
        // Handle different response formats
        const priceData = data.data || {};
        
        batch.forEach(mint => {
          const tokenData = priceData[mint];
          const price = tokenData && tokenData.price ? parseFloat(tokenData.price) : 0;
          prices[mint] = price;
          this.priceCache.set(mint, { price, timestamp: Date.now() });
        });
      } catch (error) {
        console.error('Failed to fetch batch prices:', error.message);
        // Set 0 price for failed batch
        batch.forEach(mint => {
          prices[mint] = 0;
        });
      }
    }

    return prices;
  }

  /**
   * Calculate profitability metrics from transaction history
   * Uses Helius Enhanced API tokenTransfers + accountData
   */
  async calculateProfitability(address, transactions) {
    const tokenFlows = {};      // { mint: { in: number, out: number, net: number } }
    const solFlows = { in: 0, out: 0, net: 0 };
    const swapMetrics = {
      swapCount: 0,
      successfulSwaps: 0,
      failedSwaps: 0,
      totalVolume: 0
    };

    const mints = new Set();
    const JUPITER_V6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

    // Process each transaction
    for (const tx of transactions) {
      // Track native SOL changes from accountData
      if (tx.accountData) {
        const walletAccount = tx.accountData.find(
          ad => ad.account === address
        );
        if (walletAccount && walletAccount.nativeBalanceChange) {
          const solAmount = walletAccount.nativeBalanceChange / 1e9;
          if (solAmount > 0) {
            solFlows.in += solAmount;
          } else {
            solFlows.out += Math.abs(solAmount);
          }
        }
      }

      // Track token transfers using tokenTransfers array
      if (tx.tokenTransfers && Array.isArray(tx.tokenTransfers)) {
        for (const transfer of tx.tokenTransfers) {
          const mint = transfer.mint;
          const amount = transfer.tokenAmount || 0;
          
          if (!tokenFlows[mint]) {
            tokenFlows[mint] = { in: 0, out: 0, net: 0 };
          }

          // Check if this wallet is sender or receiver
          const isReceiver = transfer.toUserAccount === address;
          const isSender = transfer.fromUserAccount === address;

          if (isReceiver && !isSender) {
            // Incoming transfer
            tokenFlows[mint].in += amount;
          } else if (isSender && !isReceiver) {
            // Outgoing transfer
            tokenFlows[mint].out += amount;
          }
          // If both (self-transfer), skip or net to 0

          mints.add(mint);
        }
      }

      // Detect Jupiter swaps
      const isJupiterSwap = tx.accountData?.some(
        ad => ad.account === JUPITER_V6
      ) || tx.type === 'SWAP' || tx.description?.toLowerCase().includes('swap');

      if (isJupiterSwap) {
        swapMetrics.swapCount++;
        if (tx.transactionError) {
          swapMetrics.failedSwaps++;
        } else {
          swapMetrics.successfulSwaps++;
        }
        
        // Estimate volume from token transfers in this tx
        if (tx.tokenTransfers) {
          const walletTransfers = tx.tokenTransfers.filter(
            tt => tt.fromUserAccount === address || tt.toUserAccount === address
          );
          walletTransfers.forEach(tt => {
            swapMetrics.totalVolume += tt.tokenAmount || 0;
          });
        }
      }
    }

    // Calculate net flows
    solFlows.net = solFlows.in - solFlows.out;
    for (const mint in tokenFlows) {
      tokenFlows[mint].net = tokenFlows[mint].in - tokenFlows[mint].out;
    }

    // Get current prices for all tokens + SOL
    const allMints = [...mints, 'So11111111111111111111111111111111111111112'];
    const prices = await this.getTokenPrices(allMints);
    const solPrice = prices['So11111111111111111111111111111111111111112'] || 0;

    // Calculate USD values (best effort - requires price feed)
    let totalInflowValue = 0;
    let totalOutflowValue = 0;
    let currentPortfolioValue = 0;
    let tokenDiversity = 0;
    let pricedTokenCount = 0;
    const tokensWithPrices = [];

    for (const [mint, flow] of Object.entries(tokenFlows)) {
      // Helius tokenTransfers are already in human-readable units
      const price = prices[mint] || 0;
      
      // Count diversity even if no price (we have the token)
      tokenDiversity++;
      
      if (price > 0) {
        pricedTokenCount++;
        tokensWithPrices.push({ mint, flow, price });
        totalInflowValue += flow.in * price;
        totalOutflowValue += flow.out * price;
        currentPortfolioValue += flow.net * price;
      }
    }

    // Add SOL flows if we have SOL price
    if (solPrice > 0) {
      totalInflowValue += solFlows.in * solPrice;
      totalOutflowValue += solFlows.out * solPrice;
      currentPortfolioValue += solFlows.net * solPrice;
    }

    // Calculate ROI (if we have any priced tokens)
    const realizedPnL = totalInflowValue - totalOutflowValue;
    const roi = totalOutflowValue > 0 
      ? ((totalInflowValue - totalOutflowValue) / totalOutflowValue) * 100 
      : (pricedTokenCount > 0 && totalInflowValue > 0 ? 100 : 0); // 100% if only priced inflows

    // Calculate swap success rate
    const swapSuccessRate = swapMetrics.swapCount > 0
      ? (swapMetrics.successfulSwaps / swapMetrics.swapCount) * 100
      : 0;

    return {
      // Core metrics
      totalInflowValue,
      totalOutflowValue,
      realizedPnL,
      currentPortfolioValue,
      roi,
      
      // Flow details
      solFlows,
      tokenFlows: Object.entries(tokenFlows).map(([mint, flow]) => ({
        mint,
        ...flow,
        currentPrice: prices[mint] || 0
      })),
      
      // Trading metrics
      swapMetrics: {
        ...swapMetrics,
        swapSuccessRate
      },
      
      // Activity metrics
      tokenDiversity,
      transactionCount: transactions.length,
      avgTransactionValue: transactions.length > 0 
        ? (totalInflowValue + totalOutflowValue) / (2 * transactions.length) 
        : 0
    };
  }

  /**
   * Get token decimals (common tokens)
   * In production, fetch from token metadata
   */
  getTokenDecimals(mint) {
    const commonDecimals = {
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6,  // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6,  // USDT
      'So11111111111111111111111111111111111111112': 9,   // SOL
      '7dHbWXmci3dT8UFYWYZweBLXgGhcQ7aMWthxwB8fYZKQ': 8,  // JitoSOL
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 9,   // mSOL
    };
    return commonDecimals[mint] || 6; // Default to 6 for most SPL tokens
  }

  /**
   * Calculate performance score from profitability (0-400)
   * Works with or without price data
   */
  calculatePerformanceScore(profitability) {
    let score = 0;
    const { roi, swapMetrics, tokenDiversity, transactionCount } = profitability;

    // Check if we have price data
    const hasPriceData = roi !== 0 || profitability.totalInflowValue > 0 || profitability.totalOutflowValue > 0;

    // ROI score (0-150) - only if price data available
    if (hasPriceData) {
      if (roi > 100) score += 150;           // 100%+ return
      else if (roi > 50) score += 120;       // 50-100%
      else if (roi > 20) score += 100;       // 20-50%
      else if (roi > 0) score += 90;          // 0-20%
      else if (roi > -20) score += 60;       // -20-0%
      else if (roi > -50) score += 30;        // -50--20%
      else score += 10;                        // < -50% (some participation)
    } else {
      // Without price data, allocate points to other categories
      // Base participation score for having activity
      score += 75;
    }

    // Swap success rate (0-120) - core metric, works without prices
    const { swapSuccessRate, swapCount } = swapMetrics;
    if (swapCount >= 10) {
      if (swapSuccessRate >= 99) score += 120;      // Near perfect
      else if (swapSuccessRate >= 95) score += 110;
      else if (swapSuccessRate >= 90) score += 100;
      else if (swapSuccessRate >= 80) score += 85;
      else if (swapSuccessRate >= 70) score += 70;
      else if (swapSuccessRate >= 50) score += 50;
      else score += 30;
    } else if (swapCount >= 5) {
      // Moderate activity
      score += swapSuccessRate >= 90 ? 80 : 60;
    } else if (swapCount > 0) {
      // Some swap activity
      score += 40;
    } else {
      // No swaps - neutral
      score += 20;
    }

    // Trading activity (0-100)
    if (transactionCount >= 500) score += 100;
    else if (transactionCount >= 200) score += 90;
    else if (transactionCount >= 100) score += 80;
    else if (transactionCount >= 50) score += 65;
    else if (transactionCount >= 25) score += 50;
    else if (transactionCount >= 10) score += 35;
    else score += Math.max(10, transactionCount * 3);

    // Token diversity (0-55)
    if (tokenDiversity >= 20) score += 55;
    else if (tokenDiversity >= 10) score += 50;
    else if (tokenDiversity >= 5) score += 40;
    else if (tokenDiversity >= 3) score += 30;
    else if (tokenDiversity >= 1) score += 20;
    else score += 0;

    return Math.min(400, Math.max(0, score));
  }
}

module.exports = { ProfitabilityCalculator };
