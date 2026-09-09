# Ticket 09 — Production callers of transaction orchestration

Mapped 2026-09-09 before any deletion.

## Production callers (keep)

| Module | Callers | Role |
|---|---|---|
| `useWriteFlow` | BorrowFlow, SupplyFlow, ConverterFlow, StreamCreateFlow, HostedConvertPanel, useApprovalWriteFlows | Exact sim, wallet, receipt, refresh |
| `compileActionGraph` | BorrowFlow, SupplyFlow | Create/borrow/supply step graph |
| `useTxQueue` / `useCreateGraphQueue` | Create graph remaining steps | Graph-step resume |
| `live-action-plan` | useWriteFlow, graph-step-plan | Fresh reads before write |
| `action-runtime` | useWriteFlow | Draft → simulate → submit |
| `composite-recovery` | useCreateGraphQueue | Receipt resume |

Surviving `useWriteFlow` is not rebuilt.

## Unreachable (deleted or residual)

| Item | Disposition |
|---|---|
| `claim-all.ts` / `planClaimAll` | Deleted in ticket 07 |
| `router.ts` / `selectHydratedRoute` / `createLiveBorrowProjectionLoader` / `loadBorrowProjection` | Deleted in ticket 07 |
| `AssetsPage` / `/assets` | Deleted in ticket 10 |
| `QueuedTx` `pool-claims` / `stream-claim` kinds | Residual test-hosted queue shapes. Create uses `graph-step` only. Kept so `useTxQueue` is not rebuilt. |

## Display vs write

Watch loads streams, loans, Fixed Return, and waiting requests as independent sources. Confirmed empty is `complete && sourceCount === 0`. A portfolio is not complete when only some sources loaded.

Writes use `createLiveActionDraft` / `useWriteFlow` with current account, chain, and exact calldata. Receipt then targeted invalidation. Global portfolio freshness is not transaction authority.
