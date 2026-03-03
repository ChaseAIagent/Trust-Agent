# AgentTrust Pricing

## Two-Tier Structure (MVP)

### Free Tier
- **100 scores total** (lifetime)
- Basic trust scoring (Performance + Security + Identity)
- Pattern detection (wash trading, velocity spikes)
- Rate limit: 10 requests/day after initial 100
- **Perfect for**: Testing, individual traders, small bots

### Pro Tier - $15/month
- **5,000 scores/day** (~150K/month)
- Everything in Free, plus:
  - **MCP Threat Detection** (AI agent token deployment detection)
  - Priority API access (lower latency)
  - Higher rate limits
- **Payment**: USDC on Solana via x402 protocol
- **Perfect for**: AI agent developers, trading firms, dApps
- **Founding User Price**: Lock in $15 forever (limited time)

---

## Why x402 (Pay-per-Use)

Instead of traditional subscription:
- **No monthly commitment** - pay only when you use
- **Solana-native** - aligns with ecosystem
- **$0.01 USDC per request** + $0.00025 network fee = $0.01025/query
- Sub-second finality
- Self-custody: no credit cards, no chargebacks

**Hybrid Model**: $50/month base + x402 for overages
- 5K included/day
- Additional scores at $0.01 via x402

---

## Competitor Comparison

| Tool | Price | Wallet Scoring | MCP Detection | Payment |
|------|-------|---------------|---------------|---------|
| **AgentTrust Free** | $0 | ✅ | ❌ | N/A |
| **AgentTrust Pro** | $15/mo | ✅ | ✅ | USDC/x402 |
| Nansen | $49/mo | ❌ (token only) | ❌ | Credit card |
| RugCheck | $0 | ❌ (token only) | ❌ | N/A |
| Bubblemaps | $79/mo | ❌ | ❌ | Credit card |

**Differentiation**: Only wallet trust scoring + only MCP detection for AI agents.

---

## Future Tiers (Post-MVP)

### Enterprise ($299/month)
- Unlimited scores
- Real-time websocket API
- x402 enrichment (CoinGecko prices, Nansen labels)
- Dedicated support
- SLA guarantees

### x402 Pay-As-You-Go
- No subscription
- $0.01/score via x402
- For variable workloads

---

## Technical Implementation

### Rate Limiting by Tier
```javascript
const TIERS = {
  free: { daily: 10, total: 100 },
  pro: { daily: 5000 },
  enterprise: { daily: Infinity }
};
```

### x402 Payment Flow
1. Client requests score with x402 header
2. Server responds with 402 Payment Required + payment details
3. Client pays via Solana transaction
4. Server verifies payment, returns score

See: `/src/api/x402-client.js` (future implementation)

---

*Pricing effective: March 2026*
*Subject to change based on Helius API costs and market demand*
