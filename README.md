# AETHER Protocol

  **Behavioral Clearing Network for BOT Chain Hackathon**

  The first on-chain protocol that detects market manipulation, computes coherence scores for trading entities, and issues zero-collateral credit based on behavioral depth.

  ## Deployed Contracts (BOT Chain Testnet, Chain ID: 968)

  | Contract | Address |
  |----------|---------|
  | AetherOracle | `0x708193f93Fb897fbeA72e7e7D19237770F19E969` |
  | AetherBDC | `0x6EAB7862385329BdaaD32f2b9587a66E768018Ba` |
  | AetherSettlement | `0x0962f369536e9AA292109840d45C0E23ee6fB382` |

  Explorer: https://scan.bohr.life  
  RPC: https://rpc.bohr.life

  ## Architecture

  - **AetherOracle** — Coherence scoring + manipulation detection
  - **AetherBDC** — Behavioral Debt Credit (zero-collateral loans based on Akashic depth)
  - **AetherSettlement** — Private Market Operations (PMO) state machine

  ## Tests

  ```
  17/17 passing
  ```

  ## Python Engines

  - `engines/bid_engine/` — Bid matching and price discovery
  - `engines/cme_engine/` — Coherence & manipulation engine
  - `engines/pmo_system/` — PMO lifecycle management
  - `scripts/api_server.py` — FastAPI REST server

  ## Quick Start

  ```bash
  npm install
  npx hardhat compile
  npx hardhat test
  npx hardhat run scripts/deploy.ts --network bohr_testnet
  ```
  