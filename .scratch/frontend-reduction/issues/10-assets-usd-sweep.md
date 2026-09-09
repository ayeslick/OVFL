# 10 — Delete `/assets`, keep USD, dead-code sweep

**Blocked by:** 09

**Status:** resolved
**Labels:** ready-for-agent

## Acceptance criteria

- [x] Wrap, unwrap, vault claim, and Create conversion have contextual homes. `/assets` is gone
- [x] wstETH USD recipe stays `stETH/USD × stEthPerToken`. Unused recipe kinds gone
- [x] Reown, Claim All, deployless lens, historical scanner RPC, lender-route reconstruction absent
- [x] Onboarding lens + request-book sentences patched
- [x] Typecheck, lint, and Vitest pass. Static build and E2E stay blocked (no production artifact / `MAINNET_RPC_URL`)

## Comments

2026-09-09: Ticket 10 re-ran gates. Typecheck, lint (0 errors), and Vitest (1024 tests) pass. Static `npm --prefix web run build` and Playwright E2E stay blocked. Production RPC and a verified production artifact are still missing.
