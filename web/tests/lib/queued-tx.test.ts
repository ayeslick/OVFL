import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { reconcileQueuedTx, type QueuedTx } from "@/lib/queued-tx";

const LENDING = "0x00000000000000000000000000000000000000a1" as Address;
const ASSET = "0x00000000000000000000000000000000000000b2" as Address;

const reviewed: QueuedTx = {
  kind: "pool-claims",
  lending: LENDING,
  asset: ASSET,
  claims: [{ loanId: 1n, claimable: 10n }],
};

describe("reconcileQueuedTx", () => {
  it("keeps an unchanged reviewed row", () => {
    expect(reconcileQueuedTx(reviewed, { ...reviewed })).toEqual({
      status: "ready",
      tx: reviewed,
    });
  });

  it("asks for review when the live row changed", () => {
    expect(
      reconcileQueuedTx(reviewed, {
        ...reviewed,
        claims: [{ loanId: 1n, claimable: 9n }],
      }),
    ).toEqual({
      status: "needs-review",
      replacement: {
        ...reviewed,
        claims: [{ loanId: 1n, claimable: 9n }],
      },
    });
  });

  it("skips when the live row is gone", () => {
    expect(reconcileQueuedTx(reviewed, null)).toEqual({ status: "skipped" });
  });
});
