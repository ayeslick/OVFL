# 03 — Switch the client to the deployed lens

**What to build:** Ordinary `readContract` on `NEXT_PUBLIC_OVRFLO_LENS`. Delete the plain per-id fallback for owner hydration. Keep windowed reads. Keep pretest bytecode gate until ticket 05 if needed, or replace it with artifact identity.

**Blocked by:** 02

**Status:** resolved
**Labels:** ready-for-agent

## Acceptance criteria

- [x] Owner enumeration uses the deployed lens address
- [x] Provenance mismatch is invalid/unavailable, not a valid position
- [x] No `stateOverride` on the owner-hydration path
- [x] Disconnected UI does not query the zero owner
