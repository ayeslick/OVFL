# 08 — Registry owner, lens-owned stream reads, snapshots

**Blocked by:** 07

**Status:** resolved
**Labels:** ready-for-agent

## Acceptance criteria

- [x] Bootstrap owns factory, lockup, lens, vaults, series, current and prior lending and books
- [x] Lens complete owner read is atomic. No extra `balanceOf`. No silent duplicate folding
- [x] Windowed walks and request-book paging use one snapshot (block number + hash check)
- [x] Escrowed streams stay in loan/request/Fixed Return sources, not as a second wallet-held row
