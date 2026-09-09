# Ticket 04 — Lens read limits

Recorded 2026-09-09. Method: Foundry `OVRFLOLensTest` in-process `eth_call` gas plus the 500-id memory test. Production provider RPC was not available in this session (`MAINNET_RPC_URL` unset) — production rows are **blocked**, not passing.

## Fixture

- Contract: `src/OVRFLOLens.sol` bound to committed OVRFLO Streams lockup.
- Streams minted as the registered vault with `createWithDurations({cancelable: false})`.
- Hydration: `streamsOfOwner` / `streamsOfOwnerIn` copying `getStream` flags.

## In-process gas (`test_Gas_WindowSizes_OneTwentyFiveFifty`)

| n | gas | notes |
|---|---|---|
| 1 | 28_501 | |
| 25 | 490_998 | wall page size today |
| 50 | 1_003_243 | |

Approximate marginal cost after base: ~20_000 gas per stream.

## In-process completeness

| n | result |
|---|---|
| 500 | `test_StreamsOfOwner_MemoryAtFiveHundredIds` pass (suite gas 95_572_774 includes minting) |

## Production providers (1, 5, 25, 100, 250, 500, 1_000, 1_500+)

| size | RPC latency | ABI bytes | eth_call gas | fail rate | decode/render | result |
|---|---|---|---|---|---|---|
| all listed | — | — | — | — | — | **blocked** — no production RPC |

Do not treat this table as a pass.

## Chosen policy

| Constant | Value | Why |
|---|---|---|
| `COMPLETE_SET_UNBOUNDED_MAX` | 250 | ~5M gas at 20k/stream. Margin under common 16–50M `eth_call` caps. 1_500 would sit near 30M. |
| `COMPLETE_SET_WINDOW` | 50 | Measured 1.0M gas. Wall stays 25 via `STREAM_PAGE_SIZE`. |

### Complete-read

Call `streamsOfOwner` once. If that call succeeds, use the returned `(total, rows)`. Integrity: `rows.length === total`. Do not convert a mismatch into a successful empty set.

### Resource-limit fallback

If `streamsOfOwner` fails with a resource-limit signature (`out of gas`, oversized response, timeout), walk `streamsOfOwnerIn` windows of 50 **once**. Do not retry `streamsOfOwner`.

A revert, decode failure, or owner mismatch is unavailable. That path does not window and does not become a successful empty set.

Lender reconstruction (old 500-id walk) is deleted in ticket 07. It does not size these constants.
