# 01 — Phase 0 baseline

**What to build:** A written baseline of checkout, toolchain, gates, import graph, Knip, and a deletion map. No production deletion in this ticket.

**Blocked by:** None

**Status:** resolved
**Labels:** ready-for-agent

## Acceptance criteria

- [x] Checkout SHA, toolchain, generated-artifact provenance, runtime profile, and test/deploy config recorded
- [x] Typecheck, lint, unit tests, static build, and E2E recorded as pass, fail, or blocked
- [x] Production import graph plus Knip (or equivalent) classified: dead, obsolete-reachable, required, test-only, uncertain
- [x] Required customer behaviors mapped to entry point, on-chain authority, and an acceptance scenario
