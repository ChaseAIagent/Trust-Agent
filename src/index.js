const express = require('express');
const { calculateAgentScore } = require('./scoring/engine');

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Get agent trust score
app.get('/api/v1/score/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const score = await calculateAgentScore(walletAddress);
    res.json(score);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AgentTrust API running on port ${PORT}`);
});
