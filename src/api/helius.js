/**
 * Helius API Integration for AgentTrust Score Platform
 * Provides transaction history, parsing, and wallet analysis
 */

const { ProfitabilityCalculator } = require('../scoring/profitability');

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

class HeliusClient {
  constructor() {
    if (!HELIUS_API_KEY) {
      throw new Error('HELIUS_API_KEY not configured');
    }
    this.rpcUrl = HELIUS_RPC_URL.includes('?api-key=') 
      ? HELIUS_RPC_URL 
      : `${HELIUS_RPC_URL}?api-key=${HELIUS_API_KEY}`;
    this.apiUrl = `https://api-mainnet.helius-rpc.com/v0`;
    this.profitabilityCalc = new ProfitabilityCalculator(this);
  }

  /**
   * Get account balance in SOL
   */
  async getBalance(address) {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address]
      })
    });
    const data = await response.json();
    return data.result?.value ? data.result.value / 1e9 : 0;
  }

  /**
   * Get transaction signatures for an address
   */
  async getTransactionSignatures(address, limit = 100) {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [address, { limit }]
      })
    });
    const data = await response.json();
    return data.result || [];
  }

  /**
   * Parse transactions with Helius Enhanced API
   */
  async parseTransactions(signatures) {
    const response = await fetch(`${this.apiUrl}/transactions/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: signatures.slice(0, 100) })
    });
    return response.json();
  }

  /**
   * Get transaction history with parsing
   */
  async getTransactionHistory(address, options = {}) {
    const { limit = 100, before = null, until = null } = options;
    
    const params = { limit };
    if (before) params.before = before;
    if (until) params.until = until;

    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [address, params]
      })
    });

    const data = await response.json();
    const signatures = data.result || [];
    
    if (signatures.length === 0) return [];

    // Parse transactions in batches
    const parsedTxs = await this.parseTransactions(signatures.map(s => s.signature));
    
    // Merge metadata
    return parsedTxs.map((tx, i) => ({
      ...tx,
      confirmationStatus: signatures[i]?.confirmationStatus,
      slot: signatures[i]?.slot,
      blockTime: signatures[i]?.blockTime
    }));
  }

  /**
   * Get wallet analysis for scoring
   * Returns key metrics: balance, tx count, types, profitability analysis
   */
  async analyzeWallet(address, options = {}) {
    const { txLimit = 100, includeProfitability = true } = options;
    
    const [balance, signatures] = await Promise.all([
      this.getBalance(address),
      this.getTransactionSignatures(address, txLimit)
    ]);

    if (signatures.length === 0) {
      return {
        address,
        balance: 0,
        transactionCount: 0,
        firstActivity: null,
        lastActivity: null,
        transactionTypes: {},
        profitability: null,
        successMetrics: null,
        transactions: []
      };
    }

    // Parse transactions for detailed analysis
    const parsedTxs = await this.parseTransactions(signatures.map(s => s.signature));
    
    // Calculate metrics
    const times = signatures.map(s => s.blockTime).filter(Boolean);
    const firstActivity = times.length > 0 ? Math.min(...times) : null;
    const lastActivity = times.length > 0 ? Math.max(...times) : null;
    
    // Transaction type analysis
    const transactionTypes = {};
    let totalFees = 0;

    parsedTxs.forEach(tx => {
      const type = tx.type || 'UNKNOWN';
      transactionTypes[type] = (transactionTypes[type] || 0) + 1;
      if (tx.fee) totalFees += tx.fee;
    });

    // Calculate profitability if requested
    let profitability = null;
    if (includeProfitability) {
      try {
        profitability = await this.profitabilityCalc.calculateProfitability(address, parsedTxs);
      } catch (error) {
        console.error('Profitability calculation failed:', error);
      }
    }
    
    // Calculate success metrics
    const { SuccessRateCalculator } = require('../scoring/success-rate');
    const successCalc = new SuccessRateCalculator();
    const successMetrics = successCalc.calculateSuccessMetrics(parsedTxs);

    return {
      address,
      balance,
      transactionCount: signatures.length,
      firstActivity,
      lastActivity,
      transactionTypes,
      accountAge: firstActivity ? Date.now() / 1000 - firstActivity : 0,
      profitability,
      successMetrics,
      totalFees,
      feeEfficiency: signatures.length > 0 ? totalFees / signatures.length : 0,
      transactions: parsedTxs
    };
  }
}

module.exports = { HeliusClient };
