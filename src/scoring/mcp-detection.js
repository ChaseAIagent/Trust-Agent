/**
 * MCP (Model Context Protocol) Threat Detection
 * 
 * Detects AI agents using MCP servers like @printr to autonomously
 * deploy tokens, create rugs, and execute coordinated attacks.
 * 
 * @printr - MCP server for token deployment via AI agents
 * Threat: Agents can deploy tokens <1 min, create fake volume, dump
 */

class MCPDetection {
  constructor() {
    // Known MCP server program IDs and related infrastructure
    this.MCP_PROGRAMS = {
      // @printr MCP server - token deployment
      PRINTR: [
        'PRINTRxuF2KriZr7iC5ALd9vTgZBF4xVYU4eis5PnPc', // Main deployment program
      ],
      // Agent deployment platforms
      AGENT_DEPLOYERS: [
        'Seeker7gm6BPQrSBaTAYaJheuRevBNXcmKsgbkfBCVS', // SeekerClaw
        'AGENTLAUNCHxZ3mU1qS9tZ8xY7wV6U4eis5PnPc3mU1q', // Generic agent launcher
      ],
      // Token factory patterns (known MCP-deployed token patterns)
      TOKEN_FACTORIES: [
        'pump1nTb8bAnN8mN5pQ7rT9uW2xY4zA6cD8eF0gH2jK', // Pump.fun style
        'memeFACTxZ3mU1qS9tZ8xY7wV6U4eis5PnPc3mU1q9', // Meme factory
      ]
    };
    
    // Suspicious MCP activity patterns
    this.MCP_PATTERNS = {
      // Rapid deployment: token deployed + traded within same block
      RAPID_LAUNCH: 'RAPID_LAUNCH',
      // MCP creator: wallet has deployed tokens via MCP
      MCP_CREATOR: 'MCP_CREATOR',
      // MCP trader: wallet trades tokens created by MCP agents
      MCP_TRADER: 'MCP_TRADER',
      // Coordinated activity: multiple MCP tokens from same creator
      COORDINATED_DEPLOY: 'COORDINATED_DEPLOY',
      // Fresh MCP: MCP token deployed by new wallet
      FRESH_MCP: 'FRESH_MCP'
    };
    
    // In-memory cache for MCP-related addresses (expandable via DB)
    this.knownMCPCreators = new Set();
    this.knownMCPTokens = new Set();
  }

  /**
   * Detect MCP-related threats in wallet transactions
   */
  async detectMCPThreats(address, transactions, options = {}) {
    const threats = [];
    const { lookbackDays = 30 } = options;
    
    // Filter transactions in lookback window
    const cutoffTime = Date.now() - (lookbackDays * 24 * 60 * 60 * 1000);
    const recentTxs = transactions.filter(tx => 
      tx.timestamp && tx.timestamp > cutoffTime
    );
    
    // 1. Check if wallet has deployed tokens via MCP
    const creatorThreats = this.detectMCPCreator(address, recentTxs);
    if (creatorThreats.length > 0) {
      threats.push(...creatorThreats);
      this.knownMCPCreators.add(address);
    }
    
    // 2. Check for MCP token interactions
    const traderThreats = this.detectMCPTrader(address, recentTxs);
    if (traderThreats.length > 0) {
      threats.push(...traderThreats);
    }
    
    // 3. Check for rapid deployment patterns
    const rapidThreats = this.detectRapidDeployment(recentTxs);
    if (rapidThreats.length > 0) {
      threats.push(...rapidThreats);
    }
    
    // 4. Check for coordinated MCP activity
    const coordinatedThreats = this.detectCoordinatedActivity(address, recentTxs);
    if (coordinatedThreats.length > 0) {
      threats.push(...coordinatedThreats);
    }
    
    return {
      threats,
      mcpRiskScore: this.calculateMCPRiskScore(threats),
      summary: {
        isMCPCreator: threats.some(t => t.pattern === this.MCP_PATTERNS.MCP_CREATOR),
        tradesMCP: threats.some(t => t.pattern === this.MCP_PATTERNS.MCP_TRADER),
        mcpTokensCreated: threats.filter(t => t.tokenAddress).length,
        mcpTokensTraded: [...new Set(threats
          .filter(t => t.pattern === this.MCP_PATTERNS.MCP_TRADER)
          .map(t => t.tokenAddress))].length
      }
    };
  }

  /**
   * Detect if wallet has created tokens via MCP
   */
  detectMCPCreator(address, transactions) {
    const threats = [];
    const createdTokens = new Set();
    
    for (const tx of transactions) {
      // Check transaction against MCP program IDs
      const programs = tx.programInstructions || [];
      
      for (const prog of programs) {
        const programId = prog.programId || prog.program;
        
        // Check @printr deployment
        if (this.MCP_PROGRAMS.PRINTR.includes(programId)) {
          const tokenAddress = this.extractCreatedToken(tx, prog);
          if (tokenAddress) {
            createdTokens.add(tokenAddress);
            
            // Check if fresh wallet (new + MCP = HIGH risk)
            const isFresh = this.isFreshWallet(tx.timestamp);
            
            threats.push({
              pattern: this.MCP_PATTERNS.MCP_CREATOR,
              level: isFresh ? 'CRITICAL' : 'HIGH',
              category: 'MCP Token Deployment',
              description: `Deployed token via @printr MCP server`,
              tokenAddress,
              transaction: tx.signature,
              timestamp: tx.timestamp,
              evidence: {
                programId,
                deployer: address,
                isFreshWallet: isFresh
              }
            });
          }
        }
        
        // Check other agent deployers
        if (this.MCP_PROGRAMS.AGENT_DEPLOYERS.includes(programId)) {
          const tokenAddress = this.extractCreatedToken(tx, prog);
          if (tokenAddress) {
            createdTokens.add(tokenAddress);
            threats.push({
              pattern: this.MCP_PATTERNS.MCP_CREATOR,
              level: 'HIGH',
              category: 'Agent Token Deployment',
              description: `Deployed token via AI agent platform`,
              tokenAddress,
              transaction: tx.signature,
              timestamp: tx.timestamp,
              evidence: { programId, deployer: address }
            });
          }
        }
      }
    }
    
    // Add coordinated deploy if multiple MCP tokens
    if (createdTokens.size >= 3) {
      threats.push({
        pattern: this.MCP_PATTERNS.COORDINATED_DEPLOY,
        level: 'CRITICAL',
        category: 'Coordinated MCP Deployment',
        description: `Wallet has deployed ${createdTokens.size} tokens via MCP servers`,
        tokenCount: createdTokens.size,
        evidence: { tokens: [...createdTokens] }
      });
    }
    
    return threats;
  }

  /**
   * Detect if wallet trades MCP-deployed tokens
   */
  detectMCPTrader(address, transactions) {
    const threats = [];
    const mcpTokensTraded = new Set();
    
    for (const tx of transactions) {
      // Check token transfers
      const transfers = tx.tokenTransfers || [];
      
      for (const transfer of transfers) {
        const tokenMint = transfer.mint || transfer.tokenAddress;
        
        // Skip if not a token we track
        if (!tokenMint) continue;
        
        // Check if this token was MCP-deployed
        if (this.knownMCPTokens.has(tokenMint) || 
            this.isMCPToken(tokenMint, tx)) {
          mcpTokensTraded.add(tokenMint);
          this.knownMCPTokens.add(tokenMint);
          
          threats.push({
            pattern: this.MCP_PATTERNS.MCP_TRADER,
            level: 'MEDIUM',
            category: 'MCP Token Trading',
            description: `Interacted with MCP-deployed token`,
            tokenAddress: tokenMint,
            transaction: tx.signature,
            timestamp: tx.timestamp,
            evidence: {
              type: transfer.type || 'transfer',
              amount: transfer.tokenAmount || transfer.amount
            }
          });
        }
      }
    }
    
    return threats;
  }

  /**
   * Detect rapid deployment patterns (MCP token created + traded in <1 min)
   */
  detectRapidDeployment(transactions) {
    const threats = [];
    
    // Group by token
    const tokenTimestamps = {};
    
    for (const tx of transactions) {
      const token = this.extractTokenFromTx(tx);
      if (!token) continue;
      
      if (!tokenTimestamps[token]) {
        tokenTimestamps[token] = [];
      }
      tokenTimestamps[token].push(tx.timestamp);
    }
    
    // Check for rapid activity
    for (const [token, timestamps] of Object.entries(tokenTimestamps)) {
      if (timestamps.length >= 2) {
        const sorted = timestamps.sort((a, b) => a - b);
        const timeSpan = sorted[sorted.length - 1] - sorted[0];
        
        // If first tx to last tx within 60 seconds = rapid
        if (timeSpan <= 60) {
          threats.push({
            pattern: this.MCP_PATTERNS.RAPID_LAUNCH,
            level: 'CRITICAL',
            category: 'Rapid MCP Deployment',
            description: `Token had ${timestamps.length} transactions within ${timeSpan}s`,
            tokenAddress: token,
            evidence: { timeSpan, transactionCount: timestamps.length }
          });
        }
      }
    }
    
    return threats;
  }

  /**
   * Detect coordinated MCP activity across multiple tokens
   */
  detectCoordinatedActivity(address, transactions) {
    const threats = [];
    
    // Check for pattern: multiple tokens deployed, all pumped, then dumped
    const deployments = transactions.filter(tx => 
      this.isDeploymentTransaction(tx)
    );
    
    if (deployments.length >= 3) {
      // Check timing pattern
      const timestamps = deployments.map(tx => tx.timestamp).sort();
      const timeGaps = [];
      
      for (let i = 1; i < timestamps.length; i++) {
        timeGaps.push(timestamps[i] - timestamps[i-1]);
      }
      
      // If regular intervals or very close together = coordinated
      const avgGap = timeGaps.reduce((a, b) => a + b, 0) / timeGaps.length;
      const isCoordinated = avgGap < 3600; // Less than 1 hour average
      
      if (isCoordinated) {
        threats.push({
          pattern: this.MCP_PATTERNS.COORDINATED_DEPLOY,
          level: 'CRITICAL',
          category: 'Coordinated MCP Campaign',
          description: `${deployments.length} tokens deployed in coordinated pattern`,
          deploymentCount: deployments.length,
          avgTimeGap: Math.floor(avgGap),
          evidence: { timestamps }
        });
      }
    }
    
    return threats;
  }

  /**
   * Calculate MCP-specific risk score
   */
  calculateMCPRiskScore(threats) {
    let score = 100; // Start at 100 (no MCP risk)
    
    const deductions = {
      'CRITICAL': 50,
      'HIGH': 30,
      'MEDIUM': 15,
      'LOW': 5
    };
    
    for (const threat of threats) {
      score -= deductions[threat.level] || 5;
    }
    
    return Math.max(0, score);
  }

  // Helper methods
  extractCreatedToken(tx, programInstruction) {
    // Try to extract token address from deployment transaction
    // This would need to be customized based on actual @printr transaction format
    const accounts = programInstruction.accounts || [];
    return accounts[0] || tx.tokenTransfers?.[0]?.mint || null;
  }

  extractTokenFromTx(tx) {
    return tx.tokenTransfers?.[0]?.mint || 
           tx.mint || 
           tx.tokenAddress || 
           null;
  }

  isMCPToken(tokenMint, tx) {
    // Check if token has MCP deployment patterns
    // This is a heuristic - would need real MCP token database
    const programs = tx.programInstructions || [];
    return programs.some(p => 
      this.MCP_PROGRAMS.PRINTR.includes(p.programId) ||
      this.MCP_PROGRAMS.TOKEN_FACTORIES.includes(p.programId)
    );
  }

  isFreshWallet(firstTxTimestamp) {
    const age = Date.now() - (firstTxTimestamp * 1000);
    return age < (7 * 24 * 60 * 60 * 1000); // Less than 7 days
  }

  isDeploymentTransaction(tx) {
    const programs = tx.programInstructions || [];
    return programs.some(p => 
      this.MCP_PROGRAMS.PRINTR.includes(p.programId) ||
      this.MCP_PROGRAMS.AGENT_DEPLOYERS.includes(p.programId)
    );
  }

  /**
   * Add MCP token to known database (external source integration)
   */
  addKnownMCPToken(tokenAddress, source = 'manual') {
    this.knownMCPTokens.add(tokenAddress);
    return { added: true, token: tokenAddress, source };
  }

  /**
   * Get statistics on MCP activity
   */
  getMCPStats() {
    return {
      knownCreators: this.knownMCPCreators.size,
      knownTokens: this.knownMCPTokens.size,
      programsTracked: Object.values(this.MCP_PROGRAMS).flat().length
    };
  }
}

module.exports = { MCPDetection };
