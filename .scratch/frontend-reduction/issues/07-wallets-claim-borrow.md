# 07 — Injected wallets, Claim All extract, delete borrow reconstruction

**Blocked by:** 06

**Status:** resolved
**Labels:** ready-for-agent

## Acceptance criteria

- [x] Wagmi injected + EIP-6963. No Reown/AppKit. E2E `wallet-runtime` seam kept
- [x] `QueuedTx` and `reconcileQueuedTx` live in a neutral module. Claim All planner gone
- [x] `router.ts`, `select-hydrated-route.mjs`, and `createLiveBorrowProjectionLoader` gone
- [x] Borrow still uses `previewBorrow` then exact `borrow` simulation
