/**
 * AgentTrust Score Platform API
 * Trustless scoring for Solana AI agents
 */

const express = require('express');
const { ScoringEngine } = require('./scoring/engine');

const app = express();
app.use(express.json());

// Initialize scoring engine
let engine;
try {
  engine = new ScoringEngine();
} catch (error) {
  console.error('Failed to initialize scoring engine:', error.message);
  process.exit(1);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '0.1.0',
    service: 'AgentTrust Score Platform'
  });
});

// Get agent trust score
app.get('/api/v1/score/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { includeProfitability = 'false' } = req.query;
    
    if (!walletAddress || walletAddress.length < 32) {
      return res.status(400).json({ 
        error: 'Invalid wallet address',
        address: walletAddress 
      });
    }

    const result = await engine.scoreWallet(walletAddress, {
      includeProfitability: includeProfitability === 'true'
    });
    
    if (result.error) {
      return res.status(500).json({ 
        error: result.error,
        address: walletAddress 
      });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get detailed profitability analysis
app.get('/api/v1/profitability/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { txLimit = 100 } = req.query;
    
    if (!walletAddress || walletAddress.length < 32) {
      return res.status(400).json({ 
        error: 'Invalid wallet address',
        address: walletAddress 
      });
    }

    const { HeliusClient } = require('./api/helius');
    const helius = new HeliusClient();
    
    const analysis = await helius.analyzeWallet(walletAddress, {
      txLimit: parseInt(txLimit),
      includeProfitability: true
    });

    if (!analysis.profitability) {
      return res.status(404).json({
        error: 'No profitability data available',
        address: walletAddress
      });
    }

    res.json({
      address: walletAddress,
      profitability: analysis.profitability,
      transactionCount: analysis.transactionCount,
      firstActivity: analysis.firstActivity,
      lastActivity: analysis.lastActivity,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Score multiple wallets (batch)
app.post('/api/v1/score/batch', async (req, res) => {
  try {
    const { addresses } = req.body;
    
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ 
        error: 'addresses array required',
        example: { addresses: ["wallet1", "wallet2"] }
      });
    }

    if (addresses.length > 10) {
      return res.status(400).json({ 
        error: 'Maximum 10 addresses per batch',
        count: addresses.length 
      });
    }

    const results = await engine.scoreWallets(addresses);
    res.json({ results, count: results.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get scoring methodology
app.get('/api/v1/methodology', (req, res) => {
  res.json({
    name: 'AgentTrust Score',
    version: '1.1',
    total: { min: 0, max: 1000 },
    components: {
      performance: { 
        min: 0, 
        max: 400, 
        description: 'Profitability, activity level, swap success rate, token diversity',
        factors: {
          roi: 'Return on investment from tracked transactions',
          swapSuccessRate: 'Percentage of successful Jupiter swaps',
          transactionCount: 'Total transaction volume and frequency',
          tokenDiversity: 'Number of unique tokens held/traded'
        }
      },
      security: { min: 0, max: 400, description: 'Fee efficiency, balance maintenance, activity span' },
      identity: { min: 0, max: 200, description: 'Account age, activity patterns, consistency' }
    },
    dataSources: {
      transactions: 'Helius Enhanced API (on-chain data)',
      prices: 'Jupiter Price API (current market prices)',
      swaps: 'Jupiter Program parsing on-chain'
    },
    riskLevels: {
      HIGH: { range: '0-399', description: 'High risk - limited activity or concerning patterns' },
      MEDIUM: { range: '400-699', description: 'Medium risk - moderate activity, some history' },
      LOW: { range: '700-1000', description: 'Low risk - established activity, good patterns' }
    }
  });
});

// Test wallet endpoint - returns our 5 test wallets
app.get('/api/v1/test-wallets', (req, res) => {
  const testWallets = [
    { 
      address: 'EKHTbXpsm6YDgJzMkFxNU1LNXeWcUW7Ezf8mjUNQQ4Pa',
      name: 'Solana Agent Kit Treasury',
      type: 'DAO Treasury'
    },
    { 
      address: '7gm6BPQrSBaTAYaJheuRevBNXcmKsgbkfBCVSjBnt9aP',
      name: 'Warp Trading Bot',
      type: 'Fee Collection'
    },
    { 
      address: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
      name: 'Jupiter Perps',
      type: 'DeFi Protocol'
    },
    { 
      address: '86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY',
      name: 'Helius Tutorial',
      type: 'Dev Example'
    },
    { 
      address: 'GP1TLVRBVfn5RuAZfzqRFA9dTy8EfpE76rbzZ5u2Y1n2',
      name: 'DeepSeek AI Agent',
      type: 'AI Agent'
    }
  ];
  
  res.json({ wallets: testWallets, count: testWallets.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║      AgentTrust Score Platform v0.1.0                ║');
  console.log('║      Trustless scoring for Solana AI agents            ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║      API running on port ${PORT}                        ║`);
  console.log('╚════════════════════════════════════════════════════════╝');
});
