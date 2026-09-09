# 06 — Remove scanner-era RPC and viem-dlc

**Blocked by:** 05

**Status:** resolved
**Labels:** ready-for-agent

## Acceptance criteria

- [x] No `logsDivider`, historical transport, or `NEXT_PUBLIC_HISTORICAL_RPC_URL` in browser config
- [x] `web/lib/deployment.ts` `getLogs` remains for build verification
- [x] Browser portfolio `getLogs` ban remains
- [x] `@morpho-org/viem-dlc` gone when no production import remains
