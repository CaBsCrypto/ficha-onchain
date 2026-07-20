# 📚 TrustLeaf — Documentation

Start at the [project README](../README.md) for the overview. This folder holds
the deep-dive docs.

| Doc | What's inside |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | The on-chain/off-chain model, signing + relayer (gasless), Privy auth & ownership enforcement, data flow with sequence diagrams. |
| [CONTRACTS.md](./CONTRACTS.md) | Every Soroban contract: methods, storage, deployed testnet IDs, and exactly what is stored on-chain. |
| [API.md](./API.md) | The REST API surface, grouped by portal, with the auth model for each route. |
| [DATA_MODEL.md](./DATA_MODEL.md) | The Neon Postgres schema and the on-chain ↔ off-chain data map. |
| [DEMO.md](./DEMO.md) | Run the full logged-in médico↔paciente journey end to end (two portals). |
| [FLUJO_TESTEO.md](./FLUJO_TESTEO.md) | The 8-phase testing-flow map (EXISTS / GAP status). |
| [PERFILES_DESIGN.md](./PERFILES_DESIGN.md) | Legal/regulatory research behind the doctor & patient profile fields. |
| [contracts-spec.md](./contracts-spec.md) | Full functional spec of the smart-contract layer. |

For the contributor workflow (branch-per-PR, CI gates, DB rules), see
[CONTRIBUTING.md](../CONTRIBUTING.md).
