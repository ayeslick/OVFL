# 04 — Lens read limits from measurement

**What to build:** Measure representative portfolio sizes. Choose complete-read and window policy. Record blocked production RPC separately from in-process gas.

**Blocked by:** 03

**Status:** resolved
**Labels:** ready-for-agent

## Acceptance criteria

- [x] Evidence file lists sizes, method, fixture, and pass/fail/blocked
- [x] Complete-read and window constants come from that evidence
- [x] Resource-limit failure of a complete read uses a bounded window once. It does not retry the oversized call
- [x] Contract/integrity failures do not become successful empty results
