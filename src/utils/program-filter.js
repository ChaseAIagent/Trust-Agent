/**
 * Program ID Filter
 * 
 * Distinguishes between:
 * - Wallet addresses (can sign transactions, have activity)
 * - Program IDs (smart contracts, invoked by wallets, show 0 direct transactions)
 * 
 * Problem: Protocols like Jupiter, Raydium return 0 transactions in Helius
 * because they're invoked by wallets, not signers.
 * 
 * Solution: Detect Program IDs and either:
 * 1. Skip scoring (return informative message)
 * 2. Score differently (analyze invocations instead of transactions)
 */

// Known Solana program IDs (system + popular protocols)
const KNOWN_PROGRAMS = {
  // System programs
  SYSTEM: '11111111111111111111111111111111',
  TOKEN: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ASSOCIATED_TOKEN: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  TOKEN_2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  
  // Popular DEXs/DeFi
  JUPITER: [
    'JUP6LkbZbjS1jKKdUam6QhJxG4b3q3d6s4mLcCR4kP',
    'JUP6LkbZbjS1jKKdUam6QhJxG4b3q3d6s4mLcCR4kP',
    'JUP6LkbZbjS1jKKd'
  ],
  RAYDIUM: [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    'CAMMCzo5YL8w4Vzv8cu4HqUaQ5KK4WoJ54WUXFyU23d'
  ],
  ORCA: [
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    '9W959DqzekajXH92zRbN5d243KyKSZFPLwisn65Y8E7z'
  ],
  METEORA: [
    'METEORA_PROGRAM_PLACEHOLDER'
  ],
  
  // LSTs/Lending
  MARINADE: 'MarBmsSgKXdrN1E44VX7adQv1x1P1kGL5aKdHvx9e9j',
  JITO: 'Jito4iGt4wsKyA9c1ZCGS4YshUqJkLN8HXHyK2W4Lx',
  SOLEND: 'So1endDq2YkqhipRh3WViPaCharmhQuoN',
  
  // NFT
  METAPLEX: [
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
    'CndyV3LdqHUfDLb3tW1yDE2eKiF1E5z7r2n3Q3D4E5F'
  ],
  MAGIC_EDEN: 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTVat5',
  
  // Bridges
  WORMHOLE: 'WormT3M8KzGj8KxL8QJ3Q4R5S6T7U8V9W0X1Y2Z3A4B5',
  
  // AI/Agent platforms
  PRINTR: 'PRINTRxuF2KriZr7iC5ALd9vTgZBF4xVYU4eis5PnPc',
  DAOSDOTFUN: 'DAOSEED1BqUdqMTkQfAAg1B6C7d8s2C4d6s4mLcCR4kP'
};

// Flatten all known programs
const ALL_PROGRAMS = Object.values(KNOWN_PROGRAMS)
  .flat()
  .filter(addr => addr && addr.length > 30);

class ProgramFilter {
  constructor() {
    this.knownPrograms = new Set(ALL_PROGRAMS);
    this.programPatterns = [
      // Common program name patterns
      /11111111111111111111111111111111/, // System
      /TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA/, // Token
      /JUP6LkbZbjS1jKKd/, // Jupiter
      /whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc/, // Orca
      /675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8/, // Raydium
    ];
  }

  /**
   * Check if address is a known program ID
   */
  isKnownProgram(address) {
    if (!address) return false;
    return this.knownPrograms.has(address);
  }

  /**
   * Check if address looks like a program ID (heuristic)
   * 
   * Heuristics:
   * 1. Known program database
   * 2. Returns 0 transactions (programs don't sign)
   * 3. Has high invocation count (called by wallets)
   * 4. Address pattern analysis
   */
  isProgram(address, transactionCount = null) {
    if (!address || address.length < 30) {
      return { isProgram: false, confidence: 'low', source: 'invalid_address', reason: 'Address too short' };
    }
    
    // Check known programs
    if (this.isKnownProgram(address)) {
      return { isProgram: true, confidence: 'high', source: 'known' };
    }
    
    // Check patterns
    for (const pattern of this.programPatterns) {
      if (pattern.test(address)) {
        return { isProgram: true, confidence: 'high', source: 'pattern' };
      }
    }
    
    // Heuristic: 0 transactions is strong signal for programs
    if (transactionCount === 0) {
      return { 
        isProgram: true, 
        confidence: 'medium', 
        source: 'zero_transactions',
        note: 'May be new wallet or program'
      };
    }
    
    return { isProgram: false, confidence: 'high', source: 'none' };
  }

  /**
   * Get program info if known
   */
  getProgramInfo(address) {
    for (const [name, addresses] of Object.entries(KNOWN_PROGRAMS)) {
      const addrList = Array.isArray(addresses) ? addresses : [addresses];
      if (addrList.includes(address)) {
        return {
          name,
          type: this.getProgramType(name),
          addresses: addrList,
          isScorable: false,
          reason: 'Programs are invoked by wallets, not signers'
        };
      }
    }
    return null;
  }

  /**
   * Get program type category
   */
  getProgramType(name) {
    const types = {
      SYSTEM: 'system',
      TOKEN: 'system',
      ASSOCIATED_TOKEN: 'system',
      TOKEN_2022: 'system',
      JUPITER: 'dex',
      RAYDIUM: 'dex',
      ORCA: 'dex',
      METEORA: 'dex',
      MARINADE: 'lst',
      JITO: 'lst',
      SOLEND: 'lending',
      METAPLEX: 'nft',
      MAGIC_EDEN: 'nft',
      WORMHOLE: 'bridge',
      PRINTR: 'ai_agent',
      DAOSDOTFUN: 'launchpad'
    };
    return types[name] || 'unknown';
  }

  /**
   * Validate if address should be scored
   * 
   * Returns:
   * - scorable: boolean
   * - reason: string (if not scorable)
   * - alternative: string (suggested alternative approach)
   */
  validateForScoring(address, transactionCount = null) {
    const check = this.isProgram(address, transactionCount);
    
    if (!check.isProgram) {
      return { scorable: true, confidence: check.confidence };
    }
    
    const info = this.getProgramInfo(address);
    
    return {
      scorable: false,
      confidence: check.confidence,
      reason: info 
        ? `${info.name} is a ${info.type} program, not a wallet`
        : 'Address appears to be a program, not a wallet',
      alternative: info 
        ? `Analyze wallets that interact with ${info.name} instead`
        : 'Check if this is a wallet address or program ID',
      programInfo: info,
      suggestion: this.getScoringAlternative(address, info)
    };
  }

  /**
   * Get alternative scoring approach
   */
  getScoringAlternative(address, programInfo) {
    if (!programInfo) {
      return {
        type: 'manual_review',
        description: 'Cannot determine if this is a wallet or program. Manual verification needed.',
        action: 'Check Solana Explorer or use helius.getBalance() to verify'
      };
    }
    
    const alternatives = {
      dex: {
        type: 'lp_analysis',
        description: `Score wallets that provide liquidity to ${programInfo.name}`,
        action: 'Query token accounts that hold LP tokens'
      },
      lst: {
        type: 'staker_analysis',
        description: `Score wallets that stake via ${programInfo.name}`,
        action: 'Query stake accounts or token holders'
      },
      lending: {
        type: 'lender_analysis',
        description: `Score wallets that lend/borrow via ${programInfo.name}`,
        action: 'Query obligation accounts'
      },
      ai_agent: {
        type: 'creator_analysis',
        description: 'Score wallets that deployed tokens via this AI agent',
        action: 'Query recent token deployments'
      },
      system: {
        type: 'skip',
        description: 'System programs cannot be scored',
        action: 'Skip - no meaningful scoring possible'
      }
    };
    
    return alternatives[programInfo.type] || alternatives.system;
  }

  /**
   * Filter list of addresses, returning only scorable wallets
   */
  filterWallets(addresses, transactionData = {}) {
    const results = {
      scorable: [],
      programs: [],
      unknown: []
    };
    
    for (const address of addresses) {
      const txCount = transactionData[address] || null;
      const validation = this.validateForScoring(address, txCount);
      
      if (validation.scorable) {
        results.scorable.push(address);
      } else if (validation.programInfo) {
        results.programs.push({ address, ...validation });
      } else {
        results.unknown.push({ address, ...validation });
      }
    }
    
    return results;
  }

  /**
   * Get all known program addresses
   */
  getKnownPrograms() {
    return [...this.knownPrograms];
  }

  /**
   * Add custom program to filter
   */
  addCustomProgram(address, name, type) {
    this.knownPrograms.add(address);
    if (!KNOWN_PROGRAMS[name]) {
      KNOWN_PROGRAMS[name] = address;
    }
    return { added: true, address, name, type };
  }
}

module.exports = { ProgramFilter, KNOWN_PROGRAMS };
