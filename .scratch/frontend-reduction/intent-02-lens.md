# Sequence 6 intent — OVRFLOLens (ticket 02)

Assumptions:
- The lockup is `factory.ovrfloStream()`. The lens binds that address in the constructor.
- The factory does not store the lens.
- Owner enumeration never needs `ok` flags. A reverting id fails the whole call.
- `getStream.wasCanceled` stays true after DEPLETED precedence in `statusOf`.
- A cancelable fixture is a test-only `createWithDurations({cancelable: true})` as the registered vault.

Predicted blast radius:
- `src/OVRFLOLens.sol` (add)
- `src/OVRFLOStreamLens.sol` (delete)
- `test/OVRFLOLens.t.sol` (replace `test/OVRFLOStreamLens.t.sol`)
- `test/DeploySize.t.sol`
- `script/seed-local.sh`
- `script/OVRFLO.s.sol` comments
- `script/lib/OVRFLOSeedRunner.sol` if it writes deployments
- `tools/scripts/write-deployment-artifact.mjs`
- `tools/scripts/write-env.sh`
- `web/wagmi.config.ts`
- tests that import `OVRFLOStreamLens`

Verification that fails if this is wrong:
- `forge test --match-contract OVRFLOLensTest`
- `forge test --match-contract DeploySizeTest`
- `forge build`
- Canceled-then-depleted: `status == DEPLETED`, `wasCanceled == true`, `isDepleted == true`
