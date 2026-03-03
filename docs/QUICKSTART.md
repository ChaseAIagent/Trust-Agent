# AgentTrust Quick Start Guide

## Get Your First Wallet Score in 5 Minutes

### 1. Get API Access

**Free Tier (No signup required):**
```bash
curl "https://api.agenttrust.io/api/v1/score/{wallet_address}?tier=free"
```
- 100 scores total (lifetime)
- Basic trust scoring
- 10 requests/day after initial 100

**Pro Tier ($15/month via x402):**
```bash
# Includes MCP detection + 5K scores/day
curl "https://api.agenttrust.io/api/v1/score/{wallet_address}?tier=pro" \
  -H "Authorization: Bearer {YOUR_API_KEY}"
```

### 2. Score a Wallet

**Example Request:**
```bash
curl "https://api.agenttrust.io/api/v1/score/7nY7H1...?includePatterns=true" | jq
```

**Example Response:**
```json
{
  "address": "7nY7H1...",
  "score": 580,
  "riskLevel": "MEDIUM",
  "breakdown": {
    "performance": 315,
    "security": 85,
    "identity": 180
  },
  "flags": [
    {
      "level": "MEDIUM",
      "category": "MEV Activity",
      "reason": "Possible sandwich attack pattern detected"
    }
  ],
  "patterns": {
    "hasMEVActivity": true,
    "hasVelocitySpike": true
  }
}
```

### 3. Understand Your Score

| Score | Risk Level | Meaning |
|-------|-----------|---------|
| 800-1000 | VERY LOW | Established, trustworthy wallet |
| 600-799 | LOW | Good history, minimal flags |
| 400-599 | MEDIUM | Some concerns, investigate |
| 200-399 | HIGH | Multiple red flags, caution advised |
| 0-199 | CRITICAL | Likely scam/rug, avoid |

**Score Components:**
- **Performance (0-400)**: Profitability, swap success, activity
- **Security (0-400)**: Pattern detection, exploit interactions, MCP threats (Pro only)
- **Identity (0-200)**: Account age, consistency, activity span

### 4. Interpret Risk Flags

**CRITICAL Flags:**
- `MCP Token Creator` - Deployed tokens via AI agent
- `Exploit Contract` - Interacted with known malicious contract
- `Large Outflow` - 80%+ balance withdrawn recently

**HIGH Flags:**
- `MEV Attack` - Possible sandwich/frontrunning
- `Wash Trading` - Repetitive swap patterns

**MEDIUM Flags:**
- `Velocity Spike` - Unusual transaction volume
- `Concentration Risk` - High activity with single counterparty

### 5. Batch Scoring

**Score Multiple Wallets:**
```bash
curl -X POST "https://api.agenttrust.io/api/v1/batch/score" \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": ["addr1...", "addr2...", "addr3..."],
    "includePatterns": true
  }' | jq
```

### 6. MCP Detection (Pro Tier)

**Why It Matters:**
AI agents can now deploy tokens autonomously via MCP servers like @printr. Our MCP detection identifies:
- Tokens deployed by AI agents
- Wallets that trade MCP-deployed tokens
- Rapid deployment patterns (coordinated campaigns)

**Pro-Only Response Fields:**
```json
{
  "mcpThreats": {
    "mcpRiskScore": 45,
    "summary": {
      "isMCPCreator": false,
      "tradesMCP": true,
      "mcpTokensTraded": 3
    }
  }
}
```

### 7. Health Check

```bash
curl "https://api.agenttrust.io/health" | jq
```

**Response:**
```json
{
  "healthy": true,
  "version": "1.1.0",
  "timestamp": "2026-03-02T15:30:00Z"
}
```

---

## Common Use Cases

### DYOR Before Trading
```bash
# Quick check before apeing into a token
curl "https://api.agenttrust.io/api/v1/score/{dev_wallet}?includePatterns=true"
# Look for: MCP creator flags, fresh wallets, velocity spikes
```

### Bot Risk Assessment
```bash
# Is this trading bot trustworthy?
curl "https://api.agenttrust.io/api/v1/score/{bot_wallet}"
# Look for: Performance > 300, Security > 100, established identity
```

### Compliance Screening
```bash
# Check multiple wallets against risk thresholds
curl -X POST "https://api.agenttrust.io/api/v1/batch/score" \
  -d '{"addresses": [wallet_list], "threshold": 400}'
# Returns only wallets below threshold (HIGH/CRITICAL risk)
```

---

## Rate Limits

| Tier | Daily Limit | Total Limit |
|------|------------|-------------|
| Free | 10 | 100 (lifetime) |
| Pro | 5,000 | Unlimited |

**Rate limit headers:**
```
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4999
X-RateLimit-Reset: 1709414400
```

---

## SDKs & Integration

**JavaScript/TypeScript:**
```bash
npm install agenttrust-sdk
```

```javascript
import { AgentTrust } from 'agenttrust-sdk';

const client = new AgentTrust({ apiKey: 'your_key' });
const score = await client.getScore('wallet_address');
console.log(score.riskLevel); // 'MEDIUM'
```

**Python:**
```bash
pip install agenttrust-py
```

```python
from agenttrust import Client

client = Client(api_key='your_key')
score = client.get_score('wallet_address')
print(score.risk_level)  # 'MEDIUM'
```

---

## Support

- **Documentation**: https://docs.agenttrust.io
- **Discord**: https://discord.gg/agenttrust
- **Email**: support@agenttrust.io
- **GitHub**: https://github.com/ChaseAIagent/Trust-Agent

---

## Next Steps

1. **Upgrade to Pro** for MCP detection and higher limits
2. **Integrate** into your dApp or trading bot
3. **Read the OpenAPI spec** at `/docs/openapi.yaml`
4. **Join Discord** for feature requests and beta access

*Built by Grimm for the Solana AI agent economy.* 💀
