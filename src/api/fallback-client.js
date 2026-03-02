/**
 * Fallback Client
 * Primary: Helius (fast, Solana-native)
 * Fallback: Bitquery (DEX-focused, cross-chain)
 */

const { HeliusClient } = require('./helius');
const { BitqueryClient } = require('./bitquery');

class FallbackClient {
  constructor() {
    this.helius = new HeliusClient();
    this.bitquery = new BitqueryClient();
    this.stats = {
      heliusCalls: 0,
      bitqueryCalls: 0,
      fallbackTriggers: 0
    };
  }

  /**
   * Get transactions with fallback
   * Tries Helius first, falls back to Bitquery if needed
   */
  async getTransactions(address, limit = 100) {
    // Try Helius first
    try {
      const signatures = await this.helius.getTransactionSignatures(address, limit);
      const transactions = await this.helius.parseTransactions(
        signatures.map(s => s.signature)
      );
      this.stats.heliusCalls++;
      
      return {
        source: 'helius',
        transactions,
        count: transactions.length
      };
    } catch (heliusError) {
      console.warn(`⚠️  Helius failed: ${heliusError.message}. Trying Bitquery...`);
      
      // Fallback to Bitquery
      if (!this.bitquery.isAvailable()) {
        throw new Error('Helius failed and Bitquery not configured');
      }

      try {
        const dexTrades = await this.bitquery.getDEXTrades(address, limit);
        const transactions = this.bitquery.normalizeDEXTrades(dexTrades, address);
        this.stats.bitqueryCalls++;
        this.stats.fallbackTriggers++;
        
        console.log(`✅ Bitquery fallback successful: ${transactions.length} trades`);
        
        return {
          source: 'bitquery',
          transactions,
          count: transactions.length,
          fallback: true
        };
      } catch (bitqueryError) {
        throw new Error(`Both sources failed - Helius: ${heliusError.message}, Bitquery: ${bitqueryError.message}`);
      }
    }
  }

  /**
   * Get DEX-specific data (Bitquery is actually better for this)
   */
  async getDEXData(address, limit = 100) {
    // For pure DEX analysis, prefer Bitquery if available
    if (this.bitquery.isAvailable()) {
      try {
        const dexTrades = await this.bitquery.getDEXTrades(address, limit);
        const transactions = this.bitquery.normalizeDEXTrades(dexTrades, address);
        this.stats.bitqueryCalls++;
        
        return {
          source: 'bitquery',
          transactions,
          count: transactions.length,
          isDEXData: true
        };
      } catch (error) {
        console.warn(`⚠️  Bitquery DEX failed: ${error.message}. Falling back to Helius...`);
      }
    }

    // Fall back to Helius
    const signatures = await this.helius.getTransactionSignatures(address, limit);
    const transactions = await this.helius.parseTransactions(
      signatures.map(s => s.signature)
    );
    this.stats.heliusCalls++;
    
    return {
      source: 'helius',
      transactions,
      count: transactions.length,
      fallback: this.bitquery.isAvailable()
    };
  }

  /**
   * Test both connections
   */
  async testConnections() {
    const results = {
      helius: { success: false },
      bitquery: { success: false, configured: this.bitquery.isAvailable() }
    };

    // Test Helius
    try {
      const balance = await this.helius.getBalance('7gm6BPQrSBaTAYaJheuRevBNXcmKsgbkfBCVSjBnt9aP');
      results.helius = { 
        success: true, 
        message: 'Connection active',
        sampleBalance: balance
      };
    } catch (error) {
      results.helius = { success: false, error: error.message };
    }

    // Test Bitquery
    if (this.bitquery.isAvailable()) {
      const bitqueryTest = await this.bitquery.testConnection();
      results.bitquery = { 
        ...bitqueryTest,
        configured: true 
      };
    }

    return results;
  }

  /**
   * Get usage stats
   */
  getStats() {
    return {
      ...this.stats,
      totalCalls: this.stats.heliusCalls + this.stats.bitqueryCalls,
      fallbackRate: this.stats.totalCalls > 0 
        ? (this.stats.fallbackTriggers / this.stats.totalCalls * 100).toFixed(1) + '%'
        : 'N/A'
    };
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = {
      heliusCalls: 0,
      bitqueryCalls: 0,
      fallbackTriggers: 0
    };
  }
}

module.exports = { FallbackClient };
