# Ticket 01 — Phase 0 baseline

Recorded 2026-09-09 against checkout `8bde4b6b9fcc46fad4f1ac4749420fd9167a04dd` (`chore(web): Bump next to 16.3.4`). Default-home UI is parked in `git stash` and is not in this tree.

## Toolchain

| Tool | Version |
|---|---|
| Git HEAD | `8bde4b6b9fcc46fad4f1ac4749420fd9167a04dd` |
| forge | 1.5.1-stable (`b0a9dd9`) |
| solc | 0.8.36, via-IR true, optimizer 200 |
| Node | v24.7.0 |
| npm | 11.5.1 |
| Next | 16.3.4 (web/package.json) |
| viem | 2.55.5 |
| wagmi | 3.7.3 |

Generated-artifact provenance: Foundry `out/` plus `web/lib/generated.ts` from `wagmi generate` (foundry plugin). OVRFLO Streams ABI comes from `artifacts/OVRFLOStream.json`. Runtime profile is `NEXT_PUBLIC_RUNTIME_PROFILE` (`local` or `production`). Tests: Vitest (`npm --prefix web run test`), Playwright E2E (`bootstrap:e2e`). Deploy: `script/seed-local.sh`, not `forge script --broadcast` on Anvil.

## Gates (pass / fail / blocked)

Recorded at ticket 01, before production deletion. Ticket 10 re-runs the same gates on the reduced tree.

| Gate | Result | Notes |
|---|---|---|
| `forge build` | pass | After `OVRFLOLens` (ticket 02) |
| `forge test --match-contract OVRFLOLensTest` | pass | 16 tests; cancelable fixture warps 1 day so cancel stays STREAMING |
| `forge test --match-contract DeploySizeTest` | pass | 7 deployables including `OVRFLOLens` |
| `npm --prefix web run typecheck` | pass | Ticket 10 re-run |
| `npm --prefix web run lint` | pass | 0 errors. Pre-existing react-hooks warnings remain |
| `npm --prefix web run test` | pass | Ticket 10: 146 files, 1024 tests. Pretest: typegen, banned-patterns, wagmi-dedupe, OVRFLO Streams bytecode |
| static `npm --prefix web run build` | blocked | Needs verified production artifact + RPC |
| E2E | blocked | Needs `MAINNET_RPC_URL` + seeded Anvil (`docs/agents/testing.md`) |

## Import graph and Knip

Knip is a root `package.json` devDependency with no repo config or npm script. Ticket 01 classification uses production `web/` imports plus a Knip dry run. Ticket 10 re-runs after deletions.

### Classified at checkout (before reduction)

**Required (keep):** `web/lib/config.ts`, `web/lib/wagmi.ts`, `web/lib/protocol-bootstrap.ts`, `web/lib/protocol/streams.ts`, `web/lib/protocol/request-book.ts`, `web/lib/actions/*` used by Create/borrow/supply, `web/hooks/useStreams.ts`, `web/hooks/useCompleteStreams.ts`, `web/hooks/useWriteFlow.ts`, `web/components/WalletRuntime.tsx`, `web/app/page.tsx` (Your OVRFLO + Create).

**Obsolete-reachable (delete in later tickets, still imported):**

| Target | Ticket |
|---|---|
| Deployless lens (`lens-bytecode.ts`, `check-lens-bytecode.mjs`, `pin-probe.ts` lens policy, `stateOverride` in streams) | 03–05 |
| Scanner RPC (`logsDivider`, `NEXT_PUBLIC_HISTORICAL_RPC_URL`, `@morpho-org/viem-dlc`) | 06 |
| Reown/AppKit | 07 |
| Claim All planner in `claim-all.ts` | 07 (extract `QueuedTx` first) |
| `web/lib/router.ts`, `select-hydrated-route.mjs`, `createLiveBorrowProjectionLoader` | 07 |
| `web/hooks/useAllMarkets.ts` duplicate discovery | 08 |
| `/assets` route and `AssetsPage` | 10 |
| Unused USD recipe kinds | 10 |

**Dead (no production import, delete in sweep):** confirm with Knip at ticket 10. Do not delete in ticket 01.

**Test-only:** `web/tests/e2e/support/wallet-runtime` seam. Keep.

### Ticket 10 Knip re-run

Obsolete-reachable rows above are gone from production. Remaining unused files Knip reports are E2E fixtures/steps, `wagmi.config.ts`, type-tests, `verify-static-export.mjs`, and `DefaultPageShell.tsx`. Keep E2E and wagmi generate. Keep `DefaultPageShell` for the parked Default-home UI. Do not delete those here.

**Uncertain:** ActionGraph / TxQueue / live-action-plan — map callers in ticket 09 before deletion.

## Customer behaviors

| Behavior | Entry | On-chain authority | Acceptance |
|---|---|---|---|
| Connect / disconnect injected wallet | WalletRuntime | EIP-6963 / injected account + chain | Connect, switch account, disconnect clears app state |
| Your OVRFLO held streams | useStreams / lens | `OVRFLOLens.streamsOfOwner*` at `NEXT_PUBLIC_OVRFLO_LENS`; sender vault + ovrfloToken | Rows match lockup; escrowed NFTs are loan/request/Fixed Return only |
| Borrow existing stream | BorrowFlow | `previewBorrow` then `borrow` | Simulated calldata matches submitted intent |
| Create from underlying | Create | hosted convert + vault `deposit` | Stream id from authenticated event, not balance guess |
| Fixed Return supply | Supply flow | market + APR + amount; wrap on reserve | Pending vs matched from receipt |
| Request book post | request book | approve book, `post`, Filled vs Waiting | Rest-then-execute stays on the book |
| Wrap / unwrap / claim | contextual after 10 | reserve wrap/unwrap; vault claim | No `/assets` route |
| USD display | usd-recipes | stETH/USD × wstETH `stEthPerToken` | Missing quote hides USD for that asset only |
