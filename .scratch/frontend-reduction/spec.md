# Frontend reduction

**Authoritative plan:** `docs/plans/2026-09-09-001-refactor-frontend-reduction-plan.md`

**First hop:** `docs/agents/system.md`. Then this spec. Then the ticket.

**Objective:** Reduce the TypeScript frontend to the one-page protocol architecture. Stop at the TypeScript completion gate. Do not port to Rust. Do not land the 2026-09-04 Default home UI.

**Parked work:** Default home UI is in `git stash` message `park: default-your-ovrflo UI (2026-09-04) before frontend reduction`. Restore that stash only after this campaign.

**Owner pins (2026-09-09):**

- Delete `/assets` in this campaign.
- Cancel denomination tickets 21 and 22 as `do not adopt`.
- Leave denomination tickets 23–25 for later.

**Tickets:** `.scratch/frontend-reduction/issues/` (01–10). This session implements all tickets in sequence.

## Ticket map

```
01 baseline
02 OVRFLOLens Solidity + deploy
03 web switch to deployed lens
04 lens benchmark (limits)
05 delete deployless stack
06 scanner RPC / viem-dlc
07 injected wallets + Claim All extract + delete borrow reconstruction
08 registry + lens-owned reads + snapshots
09 display vs write; delete unreachable orchestration
10 delete /assets + USD prune + dead-code sweep + onboarding patch
```

## Session rules

1. Do not edit the plan file while implementing.
2. Record intent before the first code write of each ticket.
3. Compare `git diff --stat` to the predicted blast radius before calling a ticket done.
4. Agent commits use commit-tree plumbing. This session implements; it does not push.

## Ignorance-lens sweep (2026-09-09)

Recorded in `ignorance-lens.md`. Residual pins the implementer must not re-open:

- Factory does not store the lens. Address is `NEXT_PUBLIC_OVRFLO_LENS` plus artifact `lens`.
- `wasCanceled` / `isDepleted` come from `getStream`, not `statusOf`.
- Complete-read and window sizes come from ticket 04 evidence, not 1500/500 habit.
- Surviving `useWriteFlow` is the TypeScript reference. Do not rebuild it.
- Cancelable lens fixtures mint through the lockup as the vault with `cancelable: true`. Production `deposit` stays non-cancelable.
