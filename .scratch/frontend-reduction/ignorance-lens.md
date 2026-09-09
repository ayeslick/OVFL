# Ignorance-lens sweep — frontend reduction

Date: 2026-09-09. Plan: `docs/plans/2026-09-09-001-refactor-frontend-reduction-plan.md`.

This sweep walked the plan against live `src/` and `web/` at `8bde4b6`. It does not re-open owner pins.

## Decision lenses

| Unit | Implied choice | Pin |
|---|---|---|
| Lens address | Factory getter vs env | Env + artifact. No `setOvrfloLens`. |
| Window revert | Own error vs lockup selector | Revert `SablierV2Lockup_InvalidQueryRange` when `start >= stop`. Clamp oversized stop locally. |
| Cancelable tests | Change production mint vs labeled fixture | Fixture only: vault-pranked `createWithDurations({cancelable: true})`. |
| Complete-read limit | Keep 1500 | Ticket 04 measures. Until production RPC evidence exists, use in-process gas plus a fail-closed windowed fallback. |
| Wallet | wagmi `injected` + EIP-6963 | Keep `wallet-runtime` E2E seam. |
| `/assets` | Quiet URL vs delete | Delete. |
| CS6 | Measure eth-compress | `do not adopt`. |

## Reality lenses

| Fact on the ground | Plan response |
|---|---|
| Working tree had Default home UI | Parked in stash. Campaign starts at `8bde4b6`. |
| `write-env.sh` emits factory only | Add `lens` artifact field and `NEXT_PUBLIC_OVRFLO_LENS`. |
| Lockup ABI has `cancel`; hand-kept interface does not | Test uses a local `ILockupCancel` interface. Do not widen production `ISablierV2LockupLinear` unless a product caller needs `cancel`. |
| `createHistoricalTransport` unused; env still required in production | Ticket 06 removes the env. |
| Claim All UI gone; `reconcileQueuedTx` live | Extract reconciliation. Delete planner. |
| `previewBorrow` already in `quote.ts`; `borrow.ts` still reconstructs routes | Ticket 07 deletes reconstruction. |
| Production provider URLs may be absent in this checkout | Ticket 04 records blocked vs pass. Limits must still be chosen from available evidence and labeled. |

## Over-specification

File names inside `web/lib/` for extracted `QueuedTx` are interchangeable. The implementer picks a neutral module next to `claim-all.ts` and deletes the planner.

## Critic

Remaining un-run lenses (EIP-1193 picker UX copy, production CSP origin audit after Reown removal, live Hosted Convert fork) are ticket-local. They do not block build-ready for 02–03.
