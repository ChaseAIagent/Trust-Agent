/**
 * AgentTrust Scoring Engine
 * 
 * Scoring Model:
 * - Performance Score (0-400): Profitability, consistency, activity
 * - Security Score (0-400): Transaction patterns, risk indicators
 * - Identity Score (0-200): Account age, activity consistency
 * - Total: 0-1000
 * 
 * Risk Levels:
 * - HIGH: < 400
 * - MEDIUM: 400-699
 * - LOW: >= 700
 */

const { HeliusClient } = require('../api/helius');

class ScoringEngine {
  constructor() {
    this.helius = new HeliusClient();
  }

  /**
   * Calculate performance score (0-400)
   * Based on: profitability, activity level, consistency, transaction diversity
   */
  calculatePerformanceScore(walletAnalysis) {
    let score = 0;
    const { transactionCount, transactionTypes, accountAge, profitability } = walletAnalysis;

    // Use profitability-based scoring if available (new method)
    if (profitability) {
      const { ProfitabilityCalculator } = require('./profitability');
      const calc = new ProfitabilityCalculator(this.helius);
      return calc.calculatePerformanceScore(profitability);
    }

    // Fallback: Legacy scoring method
    // Activity level (0-150 points)
    if (transactionCount >= 1000) score += 150;
    else if (transactionCount >= 500) score += 120;
    else if (transactionCount >= 100) score += 80;
    else if (transactionCount >= 50) score += 50;
    else if (transactionCount >= 10) score += 20;
    else score += transactionCount * 2;

    // Transaction diversity (0-100 points)
    const typeCount = Object.keys(transactionTypes).length;
    if (typeCount >= 5) score += 100;
    else if (typeCount >= 4) score += 80;
    else if (typeCount >= 3) score += 60;
    else if (typeCount >= 2) score += 40;
    else score += 20;

    // Account maturity (0-100 points)
    const ageInDays = accountAge / (24 * 60 * 60);
    if (ageInDays >= 365) score += 100;
    else if (ageInDays >= 180) score += 80;
    else if (ageInDays >= 90) score += 60;
    else if (ageInDays >= 30) score += 40;
    else score += Math.floor(ageInDays);

    // Activity consistency (0-50 points)
    const hasActivity = transactionCount > 0;
    if (hasActivity) score += 50;

    return Math.min(400, Math.max(0, score));
  }

  /**
   * Calculate security score (0-400)
   * Based on: transaction success rate, fee efficiency, risk patterns
   */
  calculateSecurityScore(walletAnalysis) {
    let score = 0;
    const { transactionCount, profitabilityIndicators } = walletAnalysis;
    
    // Base security for having activity (0-100)
    if (transactionCount > 100) score += 100;
    else score += transactionCount;

    // Fee efficiency (0-100)
    const avgFee = profitabilityIndicators.feeEfficiency;
    if (avgFee < 5000) score += 100; // Low average fees
    else if (avgFee < 10000) score += 80;
    else if (avgFee < 20000) score += 60;
    else score += 40;

    // Balance maintenance (0-100)
    const balance = walletAnalysis.balance;
    if (balance > 1) score += 100;
    else if (balance > 0.1) score += 80;
    else if (balance > 0.01) score += 60;
    else score += 40;

    // Activity span (0-100)
    const ageInDays = walletAnalysis.accountAge / (24 * 60 * 60);
    if (ageInDays > 180) score += 100;
    else if (ageInDays > 90) score += 80;
    else if (ageInDays > 30) score += 60;
    else score += 40;

    return Math.min(400, Math.max(0, score));
  }

  /**
   * Calculate identity score (0-200)
   * Based on: account age, activity patterns, consistency
   */
  calculateIdentityScore(walletAnalysis) {
    let score = 0;
    const { accountAge, transactionCount, firstActivity, lastActivity } = walletAnalysis;

    // Account age (0-100)
    const ageInDays = accountAge / (24 * 60 * 60);
    if (ageInDays >= 730) score += 100; // 2+ years
    else if (ageInDays >= 365) score += 90;
    else if (ageInDays >= 180) score += 75;
    else if (ageInDays >= 90) score += 60;
    else if (ageInDays >= 30) score += 40;
    else score += Math.floor(ageInDays * 1.3);

    // Activity consistency (0-50)
    if (firstActivity && lastActivity) {
      const span = lastActivity - firstActivity;
      const spanInDays = span / (24 * 60 * 60);
      if (spanInDays > 30 && transactionCount > 10) score += 50;
      else if (spanInDays > 7) score += 30;
      else score += 15;
    }

    // Transaction volume indicator (0-50)
    if (transactionCount >= 100) score += 50;
    else if (transactionCount >= 50) score += 40;
    else if (transactionCount >= 20) score += 30;
    else if (transactionCount >= 10) score += 20;
    else score += transactionCount * 2;

    return Math.min(200, Math.max(0, score));
  }

  /**
   * Calculate total trust score and determine risk level
   */
  calculateTrustScore(performance, security, identity) {
    const total = performance + security + identity;
    
    let riskLevel;
    if (total >= 700) riskLevel = 'LOW';
    else if (total >= 400) riskLevel = 'MEDIUM';
    else riskLevel = 'HIGH';

    return {
      total,
      performance,
      security,
      identity,
      riskLevel,
      confidence: this.calculateConfidence(performance, security, identity)
    };
  }

  /**
   * Calculate confidence level based on data quality
   */
  calculateConfidence(performance, security, identity) {
    const scores = [performance, security, identity];
    const minScore = Math.min(...scores);
    
    if (minScore >= 150) return 'HIGH';
    if (minScore >= 100) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Score a wallet address
   * Main entry point for getting a wallet's trust score
   */
  async scoreWallet(address, options = {}) {
    try {
      const { includeProfitability = false, txLimit = 100 } = options;
      
      const analysisOptions = { 
        txLimit,
        includeProfitability 
      };
      
      const analysis = await this.helius.analyzeWallet(address, analysisOptions);
      
      const performance = this.calculatePerformanceScore(analysis);
      const security = this.calculateSecurityScore(analysis);
      const identity = this.calculateIdentityScore(analysis);
      
      const score = this.calculateTrustScore(performance, security, identity);
      
      const result = {
        address,
        score,
        analysis: {
          balance: analysis.balance,
          transactionCount: analysis.transactionCount,
          accountAge: analysis.accountAge,
          firstActivity: analysis.firstActivity,
          lastActivity: analysis.lastActivity,
          transactionTypes: analysis.transactionTypes
        },
        timestamp: Date.now()
      };
      
      // Include profitability data if requested
      if (includeProfitability && analysis.profitability) {
        result.profitability = analysis.profitability;
      }
      
      return result;
      
    } catch (error) {
      return {
        address,
        error: error.message,
        score: null,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Score multiple wallets
   */
  async scoreWallets(addresses) {
    const results = [];
    for (const address of addresses) {
      const result = await this.scoreWallet(address);
      results.push(result);
      // Rate limiting - 100ms delay between requests
      await new Promise(r => setTimeout(r, 100));
    }
    return results;
  }
}

module.exports = { ScoringEngine };
