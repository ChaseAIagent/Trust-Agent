# AgentTrust Score
## The Trust Layer for Solana AI Agents

---

### What It Does
AgentTrust analyzes on-chain behavior of AI trading agents and generates a 0-1000 trust score across three dimensions:

| Component | Weight | What It Tracks |
|-----------|--------|----------------|
| **Performance** | 400 pts | Profitability, swap success, token diversity, consistency |
| **Security** | 400 pts | Transaction failures, exploit interactions, MEV patterns, wash trading |
| **Identity** | 200 pts | Account age, activity history, behavioral consistency |

---

### The Problem
AI agents control millions in DeFi capital, but **there's no way to evaluate trustworthiness** before delegating funds:

- 🚫 No visibility into failure rates or error patterns
- 🚫 No detection of malicious behavior (exploits, MEV extraction)
- 🚫 No standardized way to compare agents
- 🚫 Reactive risk management — you find out after losing money

**Result:** Investors gamble on agents. Platforms can't curate quality. The ecosystem stays risky.

---

### How It Works
1. **Ingest** → Pull transaction history via Helius API
2. **Analyze** → Detect patterns, failures, profitability, anomalies
3. **Score** → Calculate 0-1000 trust score with risk flags
4. **Flag** → Surface CRITICAL/HIGH/MEDIUM risks automatically

---

### Ideal Customer Profile

#### Primary: DeFi Platforms & Marketplaces
**Who:** AI agent listing platforms, trading strategy marketplaces, DeFi aggregators
**Pain:** Can't filter low-quality or malicious agents from their listings
**Win:** Automated curation, risk-flagged listings, higher user trust

#### Secondary: Institutional Investors & Funds
**Who:** Crypto funds, family offices, treasury managers evaluating AI trading bots
**Pain:** No due diligence framework for on-chain agents
**Win:** Quantified risk assessment before capital allocation

#### Tertiary: Risk & Compliance Teams
**Who:** DeFi protocol risk managers, security auditors
**Pain:** Reactive incident response, no behavioral monitoring
**Win:** Proactive threat detection, continuous monitoring

---

### Key Differentiators

| Feature | AgentTrust | Manual Review | On-Chain Analytics |
|---------|-----------|---------------|-------------------|
| Real-time scoring | ✅ | ❌ | Partial |
| Pattern detection (MEV, wash trading) | ✅ | ❌ | ❌ |
| Standardized 0-1000 score | ✅ | ❌ | ❌ |
| Risk flags (CRITICAL/HIGH/MEDIUM) | ✅ | ❌ | ❌ |
| API-first | ✅ | ❌ | Partial |

---

### Sample Output

```json
{
  "address": "7gm6BP...",
  "score": {
    "total": 580,
    "performance": 315,
    "security": 85,
    "identity": 180,
    "riskLevel": "MEDIUM"
  },
  "flags": [
    { "level": "HIGH", "category": "MEV Attack" },
    { "level": "MEDIUM", "category": "Wash Trading" }
  ],
  "analysis": {
    "swapSuccess": "100%",
    "tokenDiversity": 23,
    "accountAge": "703 days"
  }
}
```

---

### Integration
- **API:** REST endpoint, 200ms response time
- **Chain:** Solana (Helius RPC)
- **Data:** Up to 100 transactions analyzed per request
- **Pricing:** Usage-based (API calls) or flat licensing

---

### Get Started
**Demo:** `test-full-score.js` — run against any Solana wallet
**Integration:** Node.js SDK, REST API
**Support:** Technical onboarding, custom risk thresholds

---

*AgentTrust turns opaque on-chain behavior into actionable trust signals.*

**Contact:** Build with us. Ship trust.
