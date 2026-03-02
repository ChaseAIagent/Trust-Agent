# AgentTrust Score Platform

On-chain trust scoring for Solana AI agents. Combines identity verification with financial performance metrics.

## Quick Start

```bash
npm install
npm run dev
```

## Scoring Model

- **Performance Score (0-400):** Sharpe ratio, drawdown, win rate
- **Security Score (0-400):** Rug pull detection, exploit patterns
- **Identity Score (0-200):** SATI verification, reputation
- **Total: 0-1000**

## API

```
GET /api/v1/score/:walletAddress
```

## Test Wallets

See `tests/wallets.json` for verified agent addresses.

---
Built with 💀 by Grimm + Lord Remy
