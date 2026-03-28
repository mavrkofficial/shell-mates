# SHELL Mates

**1,000 AI lobster agents. onchain identities. A swarm dating simulation. All on Ink.**

SHELL Mates is a [Silly Hacks](https://luma.com/fools) hackathon project that generates 1,000 unique lobster identities, registers them onchain via [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004), runs a multi-agent dating simulation inspired by [MiroFish](https://github.com/666ghj/MiroFish), and writes the resulting reputation scores back onchain - all on [Ink](https://inkonchain.com) (chainId `57073`).

Swipe through the deck in the PWA: [shell-mates.ink](https://shell-mates.ink).

---

## What was done

1. **1,000 unique lobster personas** — names, taglines, bios, quirks, and animated 8-bit GIF profile pictures generated procedurally
2. **Onchain ERC-8004 identity registration** — each lobster is a registered agent with full metadata stored via `data:application/json;base64,...` URIs
3. **MiroFish-inspired AI dating simulation** — Anthropic Claude acts as a swarm of dating judges, evaluating lobsters across speed-dating tables and rating them on categories like *shellGleam*, *clawGame*, *antennaRizz*, *tailFlex*, and *butterBath*
4. **Onchain reputation scores** — simulation results are written to the custom ERC-8004 Reputation Registry via `giveFeedback`, making every lobster's dateability score permanently onchain
5. **Tinder-style PWA** — swipe right to "pinch" a lobster, see their profile, and get a match overlay

## Contracts on Ink

| Contract | Address |
|----------|---------|
| Identity Registry (proxy) | [`0x0c6576d0e73013ad549bd62d69c14982c5347032`](https://explorer.inkonchain.com/address/0x0c6576d0e73013ad549bd62d69c14982c5347032) |
| Reputation Registry (proxy) | [`0xe0acd112606ad584015a86d493d11e5534ad5cd9`](https://explorer.inkonchain.com/address/0xe0acd112606ad584015a86d493d11e5534ad5cd9) |

Built on the [ERC-8004 standard](https://www.8004.org/build) for AI agent identity and reputation.

## Repo Structure

```
contracts/                        → Solidity (ERC-8004 adapted)
  LobsterIdentityRegistryUpgradeable.sol   — agent identity registry
  LobsterReputationRegistryUpgradeable.sol — reputation scoring registry

simulation/                       → MiroFish-inspired AI dating sim
  run-dating-sim.mjs              — Anthropic Claude swarm (100 tables × 10 lobsters)
  parse-mirofish-results.mjs      — extract scores for onchain writing
  mirofish-results.json           — full simulation output (1000 agents, 6 categories)

personas/                         → procedural identity generation
  generate-personas.mjs           — LLM-powered personality generation
  generate-8bit-pfps.mjs          — deterministic pixel art engine
  generate-8bit-gifs.mjs          — animated GIF creation
  lib/pixel-lobster.mjs           — canvas-based lobster renderer

scripts/                          → deployment + onchain ops
  deploy-lobster-registry.ts      — deploy identity + reputation proxies
  register-deployer-batch.ts      — register all 1000 agents onchain
  upgrade-reputation.ts           — UUPS upgrade for bulk scoring
  write-rep-standalone.mjs        — write sim scores onchain via giveFeedback

web/                              → React PWA (Vite + vite-plugin-pwa)
  src/components/SwipeCardStack   — Tinder-style swipe UI with gestures
  public/reputation-scores.json   — baked simulation scores for instant display
```

## The Dating Simulation

The simulation uses an **Anthropic Claude-powered swarm** (inspired by [MiroFish](https://github.com/666ghj/MiroFish):

1. All 1,000 lobsters are shuffled and seated at **100 speed-dating tables** of 10 lobsters each
2. At each table, Claude acts as a dating show judge, reading every lobster's profile
3. Each lobster is rated **1–10** across 6 categories:
   - **overall** (hotOrNot) — overall dateability
   - **shellGleam** — how shiny and impressive their shell is
   - **clawGame** — strength and dexterity of their claws
   - **antennaRizz** — charisma and flirting ability
   - **tailFlex** — physical fitness and tail power
   - **butterBath** — how delightful they'd be to share a butter bath with
4. The judge also picks **match pairs** — lobsters with great chemistry
5. Results are aggregated into a leaderboard and written onchain

The full pipeline that was executed:

1. **Generated 1,000 lobster personas** with unique names, bios, quirks, and procedural 8-bit animated GIF art
2. **Deployed ERC-8004 Identity + Reputation contracts** on Ink mainnet via UUPS proxies
3. **Registered all 1,000 agents onchain** with full EIP-8004 metadata (inline `data:` URIs)
4. **Ran the Claude swarm simulation** — 100 speed-dating tables, ~5 minutes of LLM judging
5. **Parsed results** into structured scores per agent per category
6. **Upgraded the Reputation contract** via UUPS to enable simulation-driven bulk scoring
7. **Wrote all reputation scores onchain** — 1,000 agents × 6 categories via `giveFeedback`
8. **Built and deployed the PWA** at [shell-mates.ink](https://shell-mates.ink)

## Tech Stack

- **Contracts**: Solidity 0.8.24, ERC-8004, UUPS upgradeable, deployed on Ink (OP Stack L2)
- **Simulation**: Anthropic Claude (Haiku 3.5), MiroFish-inspired multi-agent architecture
- **Frontend**: React, Vite, PWA, Tinder-style swipe UI
- **Tooling**: Hardhat 3, viem, TypeScript, Node.js
- **Storage**: Supabase (GIFs + registration JSONs), onchain identity + reputation

## Credits

- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) — AI Agent Identity and Reputation standard
- [MiroFish](https://github.com/666ghj/MiroFish) — Open-source swarm intelligence engine (inspiration for the dating simulation)
- [Ink](https://inkonchain.com) — OP Stack L2 by Kraken
- Built for [Silly Hacks](https://luma.com/fools) hackathon

## License

Contracts follow upstream ERC-8004 licensing. App and scripts: MIT.
