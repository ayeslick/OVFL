# 05 — Delete the deployless frontend stack

**Blocked by:** 04

**Status:** resolved
**Labels:** ready-for-agent

## Acceptance criteria

- [x] `lens-bytecode.ts`, `check-lens-bytecode.mjs`, deployless pin-probe, and `stateOverride` lens calls are gone
- [x] `probe-pin-capability.mjs` gone if no generic consumer remains
- [x] Pretest/build hooks do not invoke missing files
- [x] OVRFLO Streams artifact verification remains
