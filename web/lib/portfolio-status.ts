import type { Address } from "viem";
import type { BorrowerLoanRow } from "@/hooks/useBorrowerBook";
import type { LenderPositionRow } from "@/hooks/useLenderBook";
import { formatTruncatedDecimal, formatUsd } from "./format";
import { tokenUsd8 } from "./usd";
import type { Usd8 } from "./units";
import { positionFilled } from "./watch-rows";

export type PortfolioLifecycle = "waiting" | "working" | "active" | "completed";
export type CollectionSort = "id" | "status" | "amount";

export type UnderlyingTotal = {
  underlying: Address;
  symbol: string;
  amount: bigint;
  count: number;
};

const STATUS_ORDER: Record<PortfolioLifecycle, number> = {
  waiting: 0,
  working: 1,
  active: 2,
  completed: 3,
};

export function loanLifecycle(
  loan: Pick<BorrowerLoanRow, "closed" | "outstanding">,
): PortfolioLifecycle {
  if (loan.closed || loan.outstanding === 0n) return "completed";
  return "active";
}

export function supplyLifecycle(
  position: Pick<LenderPositionRow, "intervalStart" | "intervalEnd" | "availableLiquidity">,
): PortfolioLifecycle {
  const filled = positionFilled(position);
  if (filled === 0n) return "waiting";
  if (position.availableLiquidity === 0n) return "active";
  return "working";
}

export function groupTotalsByUnderlying(
  rows: readonly { underlying: Address; symbol: string; amount: bigint }[],
): UnderlyingTotal[] {
  const groups = new Map<string, UnderlyingTotal>();
  for (const row of rows) {
    const key = `${row.underlying.toLowerCase()}:${row.symbol}`;
    const current = groups.get(key);
    if (current) {
      current.amount += row.amount;
      current.count += 1;
      continue;
    }
    groups.set(key, {
      underlying: row.underlying,
      symbol: row.symbol,
      amount: row.amount,
      count: 1,
    });
  }
  return [...groups.values()];
}

export function compareCollectionRows(
  left: { id: bigint; status: PortfolioLifecycle; amount: bigint },
  right: { id: bigint; status: PortfolioLifecycle; amount: bigint },
  sort: CollectionSort,
): number {
  if (sort === "status") {
    const byStatus = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    if (byStatus !== 0) return byStatus;
  }
  if (sort === "amount") {
    if (left.amount < right.amount) return 1;
    if (left.amount > right.amount) return -1;
  }
  if (left.id < right.id) return 1;
  if (left.id > right.id) return -1;
  return 0;
}

export function lifecycleLabel(status: PortfolioLifecycle): string {
  if (status === "waiting") return "Waiting";
  if (status === "working") return "Working";
  if (status === "completed") return "Completed";
  return "Active";
}

export function hubRollup(
  totals: readonly UnderlyingTotal[],
  usd8: Usd8 | null,
  usdUnderlying: Address | undefined,
): { valueText: string; secondary: string } {
  if (totals.length === 0) return { valueText: "—", secondary: "" };
  if (totals.length === 1) {
    const row = totals[0]!;
    const token = `${formatTruncatedDecimal(row.amount, 18, 2)} ${row.symbol}`;
    if (
      usd8 !== null &&
      usdUnderlying &&
      row.underlying.toLowerCase() === usdUnderlying.toLowerCase()
    ) {
      return { valueText: formatUsd(tokenUsd8(row.amount, usd8)), secondary: token };
    }
    return { valueText: token, secondary: "" };
  }
  return {
    valueText: `${totals.reduce((sum, row) => sum + row.count, 0)} positions`,
    secondary: totals
      .map((row) => `${formatTruncatedDecimal(row.amount, 18, 2)} ${row.symbol}`)
      .join(" · "),
  };
}
