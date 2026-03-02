/**
 * Transaction Success Rate Calculator
 * Analyzes transaction success/failure patterns from Helius data
 * Integrates with Security Score (0-400)
 */

class SuccessRateCalculator {
  constructor() {
    this.failurePatterns = new Map();
  }

  /**
   * Calculate comprehensive success metrics from transactions
   */
  calculateSuccessMetrics(transactions) {
    const metrics = {
      overall: { total: 0, success: 0, failed: 0, rate: 0 },
      byType: {},
      byProgram: {},
      recentTrend: { last24h: [], last7d: [] },
      failurePatterns: [],
      consecutiveFailures: 0,
      maxConsecutiveFailures: 0,
      recoveryRate: 0
    };

    let currentConsecutive = 0;
    let failuresFollowedBySuccess = 0;
    let totalFailuresWithFollowUp = 0;

    // Sort by timestamp
    const sortedTxs = [...transactions].sort((a, b) => 
      (a.timestamp || 0) - (b.timestamp || 0)
    );

    const now = Date.now() / 1000;

    for (let i = 0; i < sortedTxs.length; i++) {
      const tx = sortedTxs[i];
      const timestamp = tx.timestamp || tx.blockTime || 0;
      const isSuccess = this.isTransactionSuccess(tx);
      const type = tx.type || 'UNKNOWN';
      const programs = tx.instructions?.map(ix => ix.programId) || [];

      // Overall counts
      metrics.overall.total++;
      if (isSuccess) {
        metrics.overall.success++;
        currentConsecutive = 0;
        
        // Check if previous was failure (recovery tracking)
        if (i > 0 && !this.isTransactionSuccess(sortedTxs[i-1])) {
          failuresFollowedBySuccess++;
        }
      } else {
        metrics.overall.failed++;
        currentConsecutive++;
        metrics.maxConsecutiveFailures = Math.max(
          metrics.maxConsecutiveFailures, 
          currentConsecutive
        );
        totalFailuresWithFollowUp++;
      }

      // By type
      if (!metrics.byType[type]) {
        metrics.byType[type] = { total: 0, success: 0, failed: 0, rate: 0 };
      }
      metrics.byType[type].total++;
      if (isSuccess) {
        metrics.byType[type].success++;
      } else {
        metrics.byType[type].failed++;
      }

      // By program
      programs.forEach(program => {
        if (!metrics.byProgram[program]) {
          metrics.byProgram[program] = { total: 0, success: 0, failed: 0 };
        }
        metrics.byProgram[program].total++;
        if (isSuccess) {
          metrics.byProgram[program].success++;
        } else {
          metrics.byProgram[program].failed++;
        }
      });

      // Recent trend (24h, 7d)
      const ageHours = (now - timestamp) / 3600;
      if (ageHours <= 24) {
        metrics.recentTrend.last24h.push({ success: isSuccess, type });
      }
      if (ageHours <= 168) { // 7 days
        metrics.recentTrend.last7d.push({ success: isSuccess, type });
      }

      // Failure pattern analysis
      if (!isSuccess && tx.transactionError) {
        const errorCode = this.extractErrorCode(tx.transactionError);
        this.failurePatterns.set(errorCode, (this.failurePatterns.get(errorCode) || 0) + 1);
      }
    }

    // Calculate rates
    metrics.overall.rate = metrics.overall.total > 0
      ? (metrics.overall.success / metrics.overall.total) * 100
      : 0;

    Object.keys(metrics.byType).forEach(type => {
      const m = metrics.byType[type];
      m.rate = m.total > 0 ? (m.success / m.total) * 100 : 0;
    });

    Object.keys(metrics.byProgram).forEach(program => {
      const m = metrics.byProgram[program];
      m.rate = m.total > 0 ? (m.success / m.total) * 100 : 0;
    });

    // Recovery rate
    metrics.recoveryRate = totalFailuresWithFollowUp > 0
      ? (failuresFollowedBySuccess / totalFailuresWithFollowUp) * 100
      : 100;

    // Top failure patterns
    metrics.failurePatterns = [...this.failurePatterns.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count }));

    // Recent trend rates
    metrics.recentTrend.rate24h = metrics.recentTrend.last24h.length > 0
      ? (metrics.recentTrend.last24h.filter(t => t.success).length / metrics.recentTrend.last24h.length) * 100
      : 0;
    
    metrics.recentTrend.rate7d = metrics.recentTrend.last7d.length > 0
      ? (metrics.recentTrend.last7d.filter(t => t.success).length / metrics.recentTrend.last7d.length) * 100
      : 0;

    return metrics;
  }

  /**
   * Check if transaction succeeded
   */
  isTransactionSuccess(tx) {
    // Helius Enhanced API indicators
    if (tx.transactionError) return false;
    if (tx.meta?.err) return false;
    if (tx.status === 'failed') return false;
    
    // Success indicators
    if (tx.status === 'success') return true;
    if (tx.confirmationStatus === 'confirmed' || tx.confirmationStatus === 'finalized') {
      return !tx.meta?.err;
    }
    
    // Default: assume success if no error indicators
    return true;
  }

  /**
   * Extract error code from transaction error
   */
  extractErrorCode(error) {
    if (typeof error === 'string') return error;
    if (error?.code) return error.code;
    if (error?.message) {
      // Extract common Solana error patterns
      const patterns = [
        /insufficient funds/i,
        /slippage exceeded/i,
        /blockhash not found/i,
        /already processed/i,
        /instruction \d+ failed/i
      ];
      for (const pattern of patterns) {
        const match = error.message.match(pattern);
        if (match) return match[0];
      }
      return error.message.substring(0, 50);
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Calculate security score component from success metrics (0-150 of 400)
   */
  calculateSecurityScore(metrics) {
    let score = 0;

    // Overall success rate (0-60 points)
    const { rate } = metrics.overall;
    if (rate >= 98) score += 60;
    else if (rate >= 95) score += 50;
    else if (rate >= 90) score += 40;
    else if (rate >= 80) score += 30;
    else if (rate >= 70) score += 20;
    else if (rate >= 50) score += 10;
    else score += 5;

    // Recent trend - improving? (0-40 points)
    const { rate24h, rate7d } = metrics.recentTrend;
    if (rate24h >= 95) score += 40;
    else if (rate24h >= 90) score += 30;
    else if (rate24h >= 80) score += 20;
    else if (rate24h >= 70) score += 15;
    else if (rate7d >= 80) score += 10;
    else score += 5;

    // Consecutive failure penalty (0-25 points, inverse)
    const { maxConsecutiveFailures } = metrics;
    if (maxConsecutiveFailures === 0) score += 25;
    else if (maxConsecutiveFailures <= 1) score += 20;
    else if (maxConsecutiveFailures <= 2) score += 15;
    else if (maxConsecutiveFailures <= 3) score += 10;
    else if (maxConsecutiveFailures <= 5) score += 5;
    else score += 0;

    // Recovery rate (0-25 points)
    const { recoveryRate } = metrics;
    if (recoveryRate >= 90) score += 25;
    else if (recoveryRate >= 75) score += 20;
    else if (recoveryRate >= 50) score += 15;
    else if (recoveryRate >= 25) score += 10;
    else score += 5;

    return score;
  }

  /**
   * Get risk flags from failure patterns
   */
  getRiskFlags(metrics) {
    const flags = [];

    if (metrics.overall.rate < 80) {
      flags.push({ level: 'HIGH', reason: 'Low overall success rate', value: `${metrics.overall.rate.toFixed(1)}%` });
    }

    if (metrics.maxConsecutiveFailures >= 5) {
      flags.push({ level: 'HIGH', reason: 'Multiple consecutive failures', value: `${metrics.maxConsecutiveFailures} in a row` });
    }

    if (metrics.recentTrend.rate24h < metrics.overall.rate - 10) {
      flags.push({ level: 'MEDIUM', reason: 'Declining success rate (24h)', value: `${metrics.recentTrend.rate24h.toFixed(1)}% vs ${metrics.overall.rate.toFixed(1)}%` });
    }

    const topFailure = metrics.failurePatterns[0];
    if (topFailure && topFailure.count >= 10) {
      flags.push({ level: 'MEDIUM', reason: 'Recurring error pattern', value: `${topFailure.code} (${topFailure.count}x)` });
    }

    if (metrics.recoveryRate < 50) {
      flags.push({ level: 'MEDIUM', reason: 'Low recovery rate', value: `${metrics.recoveryRate.toFixed(1)}%` });
    }

    return flags;
  }
}

module.exports = { SuccessRateCalculator };
