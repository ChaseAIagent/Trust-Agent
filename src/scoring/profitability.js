/**
 * RPC-Native Profitability Calculator
 * Calculates PnL from Helius transaction data using on-chain balance changes
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
   * Uses on-chain balance changes + current prices
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
      // Track native SOL changes
      if (tx.nativeBalanceChanges) {
        const walletChange = tx.nativeBalanceChanges.find(
          bc => bc.account === address
        );
        if (walletChange) {
          const solAmount = walletChange.amount / 1e9;
          if (solAmount > 0) {
            solFlows.in += solAmount;
          } else {
            solFlows.out += Math.abs(solAmount);
          }
        }
      }

      // Track token transfers
      if (tx.tokenBalanceChanges) {
        for (const change of tx.tokenBalanceChanges) {
          if (change.account !== address) continue;

          const mint = change.mint;
          const amount = Math.abs(change.amount);

          if (!tokenFlows[mint]) {
            tokenFlows[mint] = { in: 0, out: 0, net: 0 };
          }

          if (change.amount > 0) {
            tokenFlows[mint].in += amount;
          } else {
            tokenFlows[mint].out += amount;
          }

          mints.add(mint);
        }
      }

      // Detect Jupiter swaps
      const isJupiterSwap = tx.accountData?.some(
        ad => ad.account === JUPITER_V6
      ) || tx.type === 'SWAP';

      if (isJupiterSwap || tx.type === 'SWAP') {
        swapMetrics.swapCount++;
        if (tx.meta?.err) {
          swapMetrics.failedSwaps++;
        } else {
          swapMetrics.successfulSwaps++;
        }
        
        // Estimate volume from token changes
        if (tx.tokenBalanceChanges) {
          const walletChanges = tx.tokenBalanceChanges.filter(
            bc => bc.account === address
          );
          walletChanges.forEach(bc => {
            swapMetrics.totalVolume += Math.abs(bc.amount);
          });
        }
      }
    }

    // Calculate net flows
    solFlows.net = solFlows.in - solFlows.out;
    for (const mint in tokenFlows) {
      tokenFlows[mint].net = tokenFlows[mint].in - tokenFlows[mint].out;
    }

    // Get current prices for all tokens
    const prices = await this.getTokenPrices([...mints, 'So11111111111111111111111111111111111111112']);
    const solPrice = prices['So11111111111111111111111111111111111111112'] || 0;

    // Calculate USD values
    let totalInflowValue = 0;
    let totalOutflowValue = 0;
    let currentPortfolioValue = 0;
    let tokenDiversity = 0;

    for (const [mint, flow] of Object.entries(tokenFlows)) {
      const decimals = this.getTokenDecimals(mint);
      const normalizedIn = flow.in / Math.pow(10, decimals);
      const normalizedOut = flow.out / Math.pow(10, decimals);
      const normalizedNet = flow.net / Math.pow(10, decimals);
      
      const price = prices[mint] || 0;
      
      if (price > 0) {
        tokenDiversity++;
        totalInflowValue += normalizedIn * price;
        totalOutflowValue += normalizedOut * price;
        currentPortfolioValue += normalizedNet * price;
      }
    }

    // Add SOL flows
    totalInflowValue += solFlows.in * solPrice;
    totalOutflowValue += solFlows.out * solPrice;
    currentPortfolioValue += solFlows.net * solPrice;

    // Calculate ROI
    const realizedPnL = totalInflowValue - totalOutflowValue;
    const roi = totalOutflowValue > 0 
      ? ((totalInflowValue - totalOutflowValue) / totalOutflowValue) * 100 
      : 0;

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
   */
  calculatePerformanceScore(profitability) {
    let score = 0;
    const { roi, swapMetrics, tokenDiversity, transactionCount } = profitability;

    // ROI score (0-150)
    if (roi > 100) score += 150;           // 100%+ return
    else if (roi > 50) score += 120;       // 50-100%
    else if (roi > 20) score += 100;       // 20-50%
    else if (roi > 0) score += 80;          // 0-20%
    else if (roi > -20) score += 50;       // -20-0%
    else if (roi > -50) score += 20;        // -50--20%
    else score += 0;                        // < -50%

    // Swap success rate (0-100)
    const { swapSuccessRate, swapCount } = swapMetrics;
    if (swapCount >= 10) {
      if (swapSuccessRate >= 95) score += 100;
      else if (swapSuccessRate >= 90) score += 80;
      else if (swapSuccessRate >= 80) score += 60;
      else if (swapSuccessRate >= 70) score += 40;
      else score += 20;
    } else if (swapCount > 0) {
      score += 50; // Participation points for new traders
    }

    // Trading activity (0-100)
    if (transactionCount >= 500) score += 100;
    else if (transactionCount >= 200) score += 80;
    else if (transactionCount >= 100) score += 60;
    else if (transactionCount >= 50) score += 40;
    else if (transactionCount >= 10) score += 20;
    else score += transactionCount * 2;

    // Token diversity (0-50)
    if (tokenDiversity >= 10) score += 50;
    else if (tokenDiversity >= 5) score += 40;
    else if (tokenDiversity >= 3) score += 30;
    else score += tokenDiversity * 10;

    return Math.min(400, Math.max(0, score));
  }
}

module.exports = { ProfitabilityCalculator };
