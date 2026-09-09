# 09 — Display freshness vs write safety; simplify orchestration

**Blocked by:** 08

**Status:** resolved
**Labels:** ready-for-agent

## Acceptance criteria

- [x] Display distinguishes loading, data, error, confirmed empty, and partial independent sources
- [x] Writes use fresh reads, exact simulation, current identity/chain, receipt, targeted refresh
- [x] Production callers of ActionGraph / TxQueue / live-action-plan mapped before deletion
- [x] Unreachable transaction systems deleted. Surviving `useWriteFlow` is not rebuilt
