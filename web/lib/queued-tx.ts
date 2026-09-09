import type { Address } from "viem";
import type { EconomicIdentity, GraphSemanticId } from "./action-graph";

export type ClaimAllPoolClaim = {
  loanId: bigint;
  claimable: bigint;
};

export type QueuedTx =
  | {
      kind: "pool-claims";
      lending: Address;
      claims: readonly ClaimAllPoolClaim[];
      asset: Address;
    }
  | {
      kind: "stream-claim";
      streamId: bigint;
      withdrawable: bigint;
      asset: Address;
    }
  | {
      kind: "graph-step";
      stepId: GraphSemanticId;
      semanticId: GraphSemanticId;
      economicIdentity: EconomicIdentity;
    };

export type QueuedTxReconciliation =
  | { status: "ready"; tx: QueuedTx }
  | { status: "needs-review"; replacement: QueuedTx }
  | { status: "skipped" };

function stableTx(tx: QueuedTx): string {
  return JSON.stringify(tx, (_key, value) =>
    typeof value === "bigint" ? `${value}n` : value,
  ).toLowerCase();
}

export function reconcileQueuedTx(
  reviewed: QueuedTx,
  current: QueuedTx | null,
): QueuedTxReconciliation {
  if (!current) return { status: "skipped" };
  return stableTx(reviewed) === stableTx(current)
    ? { status: "ready", tx: reviewed }
    : { status: "needs-review", replacement: current };
}
