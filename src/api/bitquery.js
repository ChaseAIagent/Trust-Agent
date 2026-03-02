/**
 * Bitquery CoreCast Client
 * Fallback data source for Solana transaction analysis
 * Provides DEX-specific data and real-time streaming capabilities
 *
 * NOTE: Requires valid BITQUERY_API_TOKEN in .env
 * Get token at: https://account.bitquery.io/user/api_v2/access_tokens
 * If token is invalid/expired, client will gracefully fail and Helius will be used
 */

// Using native fetch (available in Node.js 18+) — no axios dependency

class BitqueryClient {
  constructor() {
    this.apiToken = process.env.BITQUERY_API_TOKEN;
    this.baseUrl = 'https://streaming.bitquery.io';
    this.restUrl = 'https://api.bitquery.io';
    
    if (!this.apiToken) {
      console.warn('⚠️  BITQUERY_API_TOKEN not set - Bitquery fallback disabled');
    }
  }

  /**
   * Check if Bitquery is configured and available
   */
  isAvailable() {
    return !!this.apiToken;
  }

  /**
   * Fetch DEX trades for a wallet address
   * Fallback when Helius Enhanced API fails
   */
  async getDEXTrades(address, limit = 100) {
    if (!this.isAvailable()) {
      throw new Error('Bitquery not configured');
    }

    const query = `
      query MyQuery {
        solana {
          dexTrades(
            where: {any: [
              {buyer: {is: "${address}"}},
              {seller: {is: "${address}"}}
            ]}
            options: {limit: ${limit}, desc: "block.timestamp"}
          ) {
            block {
              timestamp
              height
            }
            transaction {
              signature
              fee
              success
            }
            buyer {
              address
            }
            seller {
              address
            }
            buy {
              amount
              currency {
                symbol
                mintAddress
                decimals
              }
            }
            sell {
              amount
              currency {
                symbol
                mintAddress
                decimals
              }
            }
            exchange {
              fullName
              programAddress
            }
            price
          }
        }
      }
    `;

    try {
      const response = await fetch(`${this.restUrl}/v1/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(30000)
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      return data.data?.solana?.dexTrades || [];
    } catch (error) {
      console.error('Bitquery DEX trades error:', error.message);
      throw error;
    }
  }

  /**
   * Get token transfers for a wallet
   * Alternative to Helius tokenTransfers
   */
  async getTokenTransfers(address, limit = 100) {
    if (!this.isAvailable()) {
      throw new Error('Bitquery not configured');
    }

    const query = `
      query MyQuery {
        solana {
          transfers(
            where: {any: [
              {sender: {is: "${address}"}},
              {receiver: {is: "${address}"}}
            ]}
            options: {limit: ${limit}, desc: "block.timestamp"}
          ) {
            block {
              timestamp
              height
            }
            transaction {
              signature
              fee
              success
            }
            sender {
              address
            }
            receiver {
              address
            }
            amount
            currency {
              symbol
              mintAddress
              decimals
            }
          }
        }
      }
    `;

    try {
      const response = await fetch(`${this.restUrl}/v1/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(30000)
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      return data.data?.solana?.transfers || [];
    } catch (error) {
      console.error('Bitquery transfers error:', error.message);
      throw error;
    }
  }

  /**
   * Get account balance and activity summary
   */
  async getAccountSummary(address) {
    if (!this.isAvailable()) {
      throw new Error('Bitquery not configured');
    }

    const query = `
      query MyQuery {
        solana {
          address(address: {is: "${address}"}) {
            balance
            firstActivity: transactions(options: {asc: "block.timestamp", limit: 1}) {
              block {
                timestamp
              }
            }
            latestActivity: transactions(options: {desc: "block.timestamp", limit: 1}) {
              block {
                timestamp
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch(`${this.restUrl}/v1/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(30000)
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      return data.data?.solana?.address?.[0] || null;
    } catch (error) {
      console.error('Bitquery account summary error:', error.message);
      throw error;
    }
  }

  /**
   * Convert Bitquery DEX trades to Helius-like format
   * For compatibility with existing scoring logic
   */
  normalizeDEXTrades(trades, walletAddress) {
    return trades.map(trade => {
      const isBuyer = trade.buyer?.address === walletAddress;
      return {
        signature: trade.transaction?.signature,
        timestamp: new Date(trade.block?.timestamp).getTime() / 1000,
        type: 'SWAP',
        success: trade.transaction?.success !== false,
        fee: trade.transaction?.fee || 0,
        tokenTransfers: [
          {
            fromUserAccount: isBuyer ? trade.seller?.address : walletAddress,
            toUserAccount: isBuyer ? walletAddress : trade.buyer?.address,
            tokenAmount: isBuyer ? parseFloat(trade.sell?.amount) : parseFloat(trade.buy?.amount),
            mint: isBuyer ? trade.sell?.currency?.mintAddress : trade.buy?.currency?.mintAddress,
            symbol: isBuyer ? trade.sell?.currency?.symbol : trade.buy?.currency?.symbol
          },
          {
            fromUserAccount: isBuyer ? walletAddress : trade.seller?.address,
            toUserAccount: isBuyer ? trade.buyer?.address : walletAddress,
            tokenAmount: isBuyer ? parseFloat(trade.buy?.amount) : parseFloat(trade.sell?.amount),
            mint: isBuyer ? trade.buy?.currency?.mintAddress : trade.sell?.currency?.mintAddress,
            symbol: isBuyer ? trade.buy?.currency?.symbol : trade.sell?.currency?.symbol
          }
        ],
        exchange: trade.exchange?.fullName,
        programId: trade.exchange?.programAddress,
        price: trade.price
      };
    });
  }

  /**
   * Test connection and token validity
   */
  async testConnection() {
    if (!this.isAvailable()) {
      return { success: false, error: 'Not configured' };
    }

    try {
      // Simple query to test auth
      const query = `
        query {
          solana {
            blocks(options: {limit: 1}) {
              height
            }
          }
        }
      `;

      const response = await fetch(`${this.restUrl}/v1/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(10000)
      });

      const data = await response.json();
      
      if (data.errors) {
        return { success: false, error: data.errors[0].message };
      }

      return { 
        success: true, 
        message: 'Bitquery connection active',
        blockHeight: data.data?.solana?.blocks?.[0]?.height
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { BitqueryClient };
