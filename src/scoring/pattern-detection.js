/**
 * Pattern Detection Module
 * Identifies suspicious transaction patterns and security threats
 * Integrates with Security Score (0-400) and Risk Flags
 */

// Known exploit/malicious contracts (expandable database)
const { MCPDetection } = require('./mcp-detection');

const KNOWN_EXPLOIT_CONTRACTS = [
  '5HXs3QyN2NcdWgG3GymdVKdC2cRifkDpmZHMgKqB6yX7', // Example: fake Jupiter
  'Drift1111111111111111111111111111111111111', // Example placeholder
  // Add real exploit contracts as discovered
];

// MCP-related program IDs (AI agent token deployment)
const MCP_PROGRAMS = {
  PRINTR: 'PRINTRxuF2KriZr7iC5ALd9vTgZBF4xVYU4eis5PnPc', // @printr MCP server
  AGENT_LAUNCHERS: [
    'AGENTxZ3mU1qS9tZ8xY7wV6U4eis5PnPc3mU1q', // Generic agent launchers
  ]
};

// MEV-related program IDs
const MEV_PROGRAMS = [
  'JUP6LkbZbjS1jKKd', // Jupiter Aggregator v6
  // Add more: Jito relayers, MEV extractors
];

class PatternDetector {
  constructor() {
    this.exploitContracts = new Set(KNOWN_EXPLOIT_CONTRACTS);
    this.mevPrograms = new Set(MEV_PROGRAMS);
    this.suspiciousPatterns = [];
    this.mcpDetector = new MCPDetection();
  }

  /**
   * Analyze transactions for suspicious patterns
   */
  async detectPatterns(address, transactions, currentBalance, options = {}) {
    const patterns = {
      largeOutflows: this.detectLargeOutflows(address, transactions, currentBalance),
      exploitInteractions: this.detectExploitInteractions(transactions),
      mevActivity: this.detectMEVActivity(transactions),
      velocitySpikes: this.detectVelocitySpikes(transactions),
      concentrationRisk: this.detectConcentrationRisk(transactions),
      washTrading: this.detectWashTrading(transactions),
      mcpThreats: await this.detectMCPThreats(address, transactions, options),
      timestamp: Date.now()
    };

    // Calculate security impact
    patterns.securityDeduction = this.calculateSecurityDeduction(patterns);
    patterns.riskFlags = this.generateRiskFlags(patterns);
    patterns.riskLevel = this.calculateRiskLevel(patterns);

    return patterns;
  }

  /**
   * Detect sudden large outflows (>80% of balance)
   */
  detectLargeOutflows(address, transactions, currentBalance) {
    const outflows = [];
    
    // Sort by time
    const sortedTxs = [...transactions].sort((a, b) => 
      (a.timestamp || 0) - (b.timestamp || 0)
    );

    // Track running balance (approximate from transaction history)
    let runningBalance = 0;
    const balanceHistory = [];

    for (const tx of sortedTxs) {
      const timestamp = tx.timestamp || tx.blockTime || 0;
      let outflowAmount = 0;
      let inflowAmount = 0;

      // Check SOL transfers
      if (tx.nativeTransfers) {
        for (const transfer of tx.nativeTransfers) {
          if (transfer.fromUserAccount === address) {
            outflowAmount += transfer.amount / 1e9;
          }
          if (transfer.toUserAccount === address) {
            inflowAmount += transfer.amount / 1e9;
          }
        }
      }

      // Check token transfers
      if (tx.tokenTransfers) {
        for (const transfer of tx.tokenTransfers) {
          if (transfer.fromUserAccount === address) {
            outflowAmount += transfer.tokenAmount || 0;
          }
          if (transfer.toUserAccount === address) {
            inflowAmount += transfer.tokenAmount || 0;
          }
        }
      }

      runningBalance += inflowAmount - outflowAmount;
      balanceHistory.push({ timestamp, balance: runningBalance });

      // Check for large outflow (>80% of balance at that time)
      const priorBalance = runningBalance + outflowAmount;
      if (priorBalance > 0 && outflowAmount > 0) {
        const outflowPercent = outflowAmount / priorBalance;
        if (outflowPercent > 0.8) {
          outflows.push({
            signature: tx.signature,
            timestamp,
            amount: outflowAmount,
            percentOfBalance: outflowPercent * 100,
            severity: outflowPercent > 0.95 ? 'CRITICAL' : outflowPercent > 0.9 ? 'HIGH' : 'MEDIUM'
          });
        }
      }
    }

    return {
      count: outflows.length,
      events: outflows.slice(-10), // Last 10 events
      hasRecentOutflow: outflows.some(o => (Date.now() / 1000 - o.timestamp) < 86400)
    };
  }

  /**
   * Detect interactions with known exploit contracts
   */
  detectExploitInteractions(transactions) {
    const interactions = [];

    for (const tx of transactions) {
      const programs = tx.instructions?.map(ix => ix.programId) || [];
      
      for (const programId of programs) {
        if (this.exploitContracts.has(programId)) {
          interactions.push({
            signature: tx.signature,
            timestamp: tx.timestamp || tx.blockTime,
            contract: programId,
            type: 'KNOWN_EXPLOIT'
          });
        }
      }
    }

    return {
      count: interactions.length,
      events: interactions,
      hasExploitInteraction: interactions.length > 0
    };
  }

  /**
   * Detect MEV-related transaction patterns
   */
  detectMEVActivity(transactions) {
    const mevTxs = [];
    let sandwichCount = 0;
    let frontrunCount = 0;

    // Group swaps by time window (2 min) for sandwich detection
    const swapGroups = this.groupSwapsByTimeWindow(transactions, 120);

    for (const group of swapGroups) {
      if (group.length >= 3) {
        // Check for sandwich pattern: A-B-A where middle is victim
        const potentialSandwich = this.detectSandwichPattern(group);
        if (potentialSandwich) {
          sandwichCount++;
        }
      }
    }

    // Check individual MEV indicators
    for (const tx of transactions) {
      const programs = tx.instructions?.map(ix => ix.programId) || [];
      const isMEVProgram = programs.some(p => this.mevPrograms.has(p));
      
      if (isMEVProgram) {
        // Check for high gas/fee relative to transaction (frontrunning indicator)
        const fee = tx.meta?.fee || 0;
        const hasHighFee = fee > 1000000; // > 0.001 SOL

        mevTxs.push({
          signature: tx.signature,
          timestamp: tx.timestamp || tx.blockTime,
          fee,
          highFee: hasHighFee
        });

        if (hasHighFee) {
          frontrunCount++;
        }
      }
    }

    return {
      mevTransactionCount: mevTxs.length,
      sandwichPatterns: sandwichCount,
      frontrunIndicators: frontrunCount,
      events: mevTxs.slice(-10),
      hasMEVActivity: mevTxs.length > 0 || sandwichCount > 0
    };
  }

  /**
   * Group swap transactions by time window
   */
  groupSwapsByTimeWindow(transactions, windowSeconds) {
    const swaps = transactions
      .filter(tx => tx.type === 'SWAP')
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const groups = [];
    let currentGroup = [];
    let windowStart = 0;

    for (const swap of swaps) {
      const timestamp = swap.timestamp || swap.blockTime || 0;
      
      if (currentGroup.length === 0) {
        windowStart = timestamp;
        currentGroup.push(swap);
      } else if (timestamp - windowStart <= windowSeconds) {
        currentGroup.push(swap);
      } else {
        groups.push(currentGroup);
        currentGroup = [swap];
        windowStart = timestamp;
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Detect MCP (AI agent) threats
   */
  async detectMCPThreats(address, transactions, options = {}) {
    return await this.mcpDetector.detectMCPThreats(address, transactions, options);
  }

  /**
   * Detect sandwich attack pattern
   */
  detectSandwichPattern(swapGroup) {
    // Simplified: look for same token pairs in quick succession
    if (swapGroup.length < 3) return false;

    const first = swapGroup[0];
    const middle = swapGroup.slice(1, -1);
    const last = swapGroup[swapGroup.length - 1];

    // Check if first and last have similar characteristics (attacker)
    // and middle is different (victim)
    return middle.length > 0;
  }

  /**
   * Detect unusual transaction velocity spikes
   */
  detectVelocitySpikes(transactions) {
    const hourlyCounts = {};
    
    for (const tx of transactions) {
      const timestamp = tx.timestamp || tx.blockTime || 0;
      const hour = Math.floor(timestamp / 3600);
      hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
    }

    const counts = Object.values(hourlyCounts);
    const avgVelocity = counts.reduce((a, b) => a + b, 0) / counts.length;
    const maxVelocity = Math.max(...counts);

    // Find spikes (>3x average)
    const spikes = [];
    for (const [hour, count] of Object.entries(hourlyCounts)) {
      if (count > avgVelocity * 3 && count > 10) {
        spikes.push({
          hour: parseInt(hour),
          count,
          multiplier: count / avgVelocity
        });
      }
    }

    return {
      averageVelocity: avgVelocity,
      maxVelocity,
      spikeCount: spikes.length,
      spikes: spikes.sort((a, b) => b.multiplier - a.multiplier).slice(0, 5),
      hasVelocitySpike: spikes.length > 0
    };
  }

  /**
   * Detect concentration risk (too many transactions with single counterparty)
   */
  detectConcentrationRisk(transactions) {
    const counterpartyCounts = {};

    for (const tx of transactions) {
      const addresses = new Set();
      
      // Extract addresses from transfers
      if (tx.nativeTransfers) {
        for (const t of tx.nativeTransfers) {
          addresses.add(t.fromUserAccount);
          addresses.add(t.toUserAccount);
        }
      }
      
      if (tx.tokenTransfers) {
        for (const t of tx.tokenTransfers) {
          addresses.add(t.fromUserAccount);
          addresses.add(t.toUserAccount);
        }
      }

      for (const addr of addresses) {
        counterpartyCounts[addr] = (counterpartyCounts[addr] || 0) + 1;
      }
    }

    const sorted = Object.entries(counterpartyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const totalTx = transactions.length;
    const topCounterparty = sorted[0];
    const concentrationPercent = topCounterparty ? (topCounterparty[1] / totalTx) * 100 : 0;

    return {
      topCounterparties: sorted.map(([addr, count]) => ({ address: addr, count })),
      concentrationPercent,
      highConcentration: concentrationPercent > 50
    };
  }

  /**
   * Detect wash trading (buying/selling same amounts repeatedly)
   */
  detectWashTrading(transactions) {
    const swapPairs = [];
    const swaps = transactions.filter(tx => tx.type === 'SWAP');

    // Look for A→B followed quickly by B→A
    for (let i = 0; i < swaps.length - 1; i++) {
      const current = swaps[i];
      const next = swaps[i + 1];
      
      const timeDiff = (next.timestamp || 0) - (current.timestamp || 0);
      
      // Within 5 minutes
      if (timeDiff < 300) {
        // Check if they're inverse swaps (simplified detection)
        const currentTokens = this.extractSwapTokens(current);
        const nextTokens = this.extractSwapTokens(next);
        
        if (currentTokens && nextTokens &&
            currentTokens.in === nextTokens.out &&
            currentTokens.out === nextTokens.in) {
          swapPairs.push({
            signatures: [current.signature, next.signature],
            timeDiff,
            tokens: currentTokens
          });
        }
      }
    }

    return {
      washTradeCount: swapPairs.length,
      pairs: swapPairs.slice(-5),
      hasWashTrading: swapPairs.length > 2
    };
  }

  /**
   * Extract token info from swap transaction
   */
  extractSwapTokens(tx) {
    const transfers = tx.tokenTransfers || [];
    if (transfers.length < 2) return null;

    return {
      in: transfers[0]?.mint,
      out: transfers[1]?.mint,
      inAmount: transfers[0]?.tokenAmount,
      outAmount: transfers[1]?.tokenAmount
    };
  }

  /**
   * Calculate security score deduction from patterns
   */
  calculateSecurityDeduction(patterns) {
    let deduction = 0;

    // Large outflows (0-100 points)
    if (patterns.largeOutflows.count > 0) {
      const critical = patterns.largeOutflows.events.filter(e => e.severity === 'CRITICAL').length;
      const high = patterns.largeOutflows.events.filter(e => e.severity === 'HIGH').length;
      deduction += Math.min(100, critical * 50 + high * 30 + patterns.largeOutflows.count * 10);
    }

    // Exploit interactions (0-150 points - SEVERE)
    if (patterns.exploitInteractions.hasExploitInteraction) {
      deduction += Math.min(150, patterns.exploitInteractions.count * 75);
    }

    // MEV activity (0-50 points)
    if (patterns.mevActivity.hasMEVActivity) {
      deduction += Math.min(50, patterns.mevActivity.sandwichPatterns * 25 + patterns.mevActivity.frontrunIndicators * 10);
    }

    // Velocity spikes (0-40 points)
    if (patterns.velocitySpikes.hasVelocitySpike) {
      deduction += Math.min(40, patterns.velocitySpikes.spikeCount * 20);
    }

    // Concentration risk (0-30 points)
    if (patterns.concentrationRisk.highConcentration) {
      deduction += 30;
    }

    // Wash trading (0-30 points)
    if (patterns.washTrading.hasWashTrading) {
      deduction += Math.min(30, patterns.washTrading.washTradeCount * 10);
    }

    // MCP threats (0-100 points - emerging AI risk)
    if (patterns.mcpThreats && patterns.mcpThreats.threats.length > 0) {
      const mcpDeduction = 100 - patterns.mcpThreats.mcpRiskScore;
      deduction += Math.min(100, mcpDeduction);
    }

    return Math.min(400, deduction);
  }

  /**
   * Generate risk flags for UI display
   */
  generateRiskFlags(patterns) {
    const flags = [];

    if (patterns.largeOutflows.hasRecentOutflow) {
      const recent = patterns.largeOutflows.events.filter(e => (Date.now() / 1000 - e.timestamp) < 86400);
      flags.push({
        level: recent.some(e => e.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH',
        category: 'Large Outflow',
        reason: 'Recent large balance withdrawal detected',
        details: `${recent.length} event(s) in last 24h`
      });
    }

    if (patterns.exploitInteractions.hasExploitInteraction) {
      flags.push({
        level: 'CRITICAL',
        category: 'Exploit Contract',
        reason: 'Interaction with known malicious contract',
        details: `${patterns.exploitInteractions.count} interaction(s) detected`
      });
    }

    if (patterns.mevActivity.sandwichPatterns > 0) {
      flags.push({
        level: 'HIGH',
        category: 'MEV Attack',
        reason: 'Possible sandwich attack pattern detected',
        details: `${patterns.mevActivity.sandwichPatterns} pattern(s) found`
      });
    }

    if (patterns.mevActivity.frontrunIndicators > 5) {
      flags.push({
        level: 'MEDIUM',
        category: 'MEV Activity',
        reason: 'Multiple high-fee transactions (frontrunning)',
        details: `${patterns.mevActivity.frontrunIndicators} indicators`
      });
    }

    if (patterns.velocitySpikes.hasVelocitySpike) {
      flags.push({
        level: 'MEDIUM',
        category: 'Velocity Spike',
        reason: 'Unusual transaction velocity detected',
        details: `${patterns.velocitySpikes.spikeCount} spike(s)`
      });
    }

    if (patterns.concentrationRisk.highConcentration) {
      flags.push({
        level: 'MEDIUM',
        category: 'Concentration Risk',
        reason: 'High transaction concentration with single counterparty',
        details: `${patterns.concentrationRisk.concentrationPercent.toFixed(1)}% with top counterparty`
      });
    }

    if (patterns.washTrading.hasWashTrading) {
      flags.push({
        level: 'MEDIUM',
        category: 'Wash Trading',
        reason: 'Repetitive swap patterns detected',
        details: `${patterns.washTrading.washTradeCount} pair(s)`
      });
    }

    // MCP threats (AI agent risks)
    if (patterns.mcpThreats && patterns.mcpThreats.threats.length > 0) {
      const mcpSummary = patterns.mcpThreats.summary;
      
      if (mcpSummary.isMCPCreator) {
        flags.push({
          level: 'CRITICAL',
          category: 'MCP Token Creator',
          reason: 'Wallet has deployed tokens via AI agent MCP',
          details: `${mcpSummary.mcpTokensCreated} MCP token(s) created`
        });
      }
      
      if (mcpSummary.tradesMCP) {
        flags.push({
          level: mcpSummary.isMCPCreator ? 'CRITICAL' : 'HIGH',
          category: 'MCP Token Trader',
          reason: 'Interacts with AI-deployed tokens',
          details: `${mcpSummary.mcpTokensTraded} MCP token(s) traded`
        });
      }
      
      // Add specific MCP threat flags
      for (const threat of patterns.mcpThreats.threats.slice(0, 3)) {
        flags.push({
          level: threat.level,
          category: threat.category,
          reason: threat.description,
          details: threat.tokenAddress ? `Token: ${threat.tokenAddress.slice(0, 8)}...` : ''
        });
      }
    }

    return flags;
  }

  /**
   * Calculate overall risk level
   */
  calculateRiskLevel(patterns) {
    const criticalFlags = patterns.riskFlags.filter(f => f.level === 'CRITICAL').length;
    const highFlags = patterns.riskFlags.filter(f => f.level === 'HIGH').length;

    if (criticalFlags > 0 || patterns.securityDeduction > 200) return 'CRITICAL';
    if (highFlags > 0 || patterns.securityDeduction > 100) return 'HIGH';
    if (patterns.securityDeduction > 50) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get pattern summary for quick assessment
   */
  getSummary(patterns) {
    return {
      riskLevel: patterns.riskLevel,
      securityDeduction: patterns.securityDeduction,
      flagCount: patterns.riskFlags.length,
      criticalIssues: patterns.riskFlags.filter(f => f.level === 'CRITICAL').length,
      highIssues: patterns.riskFlags.filter(f => f.level === 'HIGH').length,
      categories: [...new Set(patterns.riskFlags.map(f => f.category))]
    };
  }
}

module.exports = { PatternDetector, KNOWN_EXPLOIT_CONTRACTS };
