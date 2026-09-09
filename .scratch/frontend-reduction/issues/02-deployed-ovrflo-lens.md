# 02 — Deployed OVRFLOLens

**What to build:** Replace deployless `OVRFLOStreamLens` with deployed `OVRFLOLens`. Immutable lockup. Artifact `lens` + `NEXT_PUBLIC_OVRFLO_LENS`. Tests include canceled-and-depleted.

**Blocked by:** 01

**Status:** resolved
**Labels:** ready-for-agent

## Acceptance criteria

- [x] `src/OVRFLOLens.sol` is the product lens. `OVRFLOStreamLens.sol` is gone
- [x] `lockup` is a constructor immutable with a getter. No per-call lockup argument
- [x] `streamsOfOwner` / `streamsOfOwnerIn` return `(total, StreamView[])`. No `ok`, no `hydrateOne`, no `streamsByIds`
- [x] `isDepleted` and `wasCanceled` copy `getStream` fields. `status` is `statusOf`
- [x] Window: reject `start >= stop`; clamp oversized stop; empty when start is at or past total
- [x] Seed, artifact writer, `write-env.sh`, DeploySize, wagmi foundry include
- [x] Canceled-and-depleted fixture labeled; production mint stays non-cancelable
