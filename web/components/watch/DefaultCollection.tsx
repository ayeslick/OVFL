"use client";

import type { Address } from "viem";
import type { BorrowerLoanRow } from "@/hooks/useBorrowerBook";
import type { LenderPositionRow } from "@/hooks/useLenderBook";
import type { HydratedStream } from "@/hooks/useStreams";
import {
  fixedCapsuleSegments,
  loanCapsuleSegments,
  streamCapsuleSegments,
} from "@/lib/capsule-segments";
import { formatAprBps, formatTruncatedDecimal } from "@/lib/format";
import { interpolateStreamed } from "@/lib/payoff";
import type { PortfolioType } from "@/lib/parse";
import {
  compareCollectionRows,
  lifecycleLabel,
  loanLifecycle,
  supplyLifecycle,
  type CollectionSort,
} from "@/lib/portfolio-status";
import type { RestingRequestRow } from "@/lib/protocol/request-book";
import { positionClaimable, positionFilled } from "@/lib/watch-rows";
import { PortfolioCollection, type CollectionCard } from "./PortfolioViews";

function formatAmount(value: bigint): string {
  return formatTruncatedDecimal(value, 18, 2);
}

export function DefaultCollection({
  type,
  loans,
  positions,
  streams,
  waitingRequests,
  nowSeconds,
  sort,
  onSort,
  onOpenLoan,
  onOpenPosition,
  onOpenStream,
}: {
  type: PortfolioType;
  loans: readonly BorrowerLoanRow[];
  positions: readonly LenderPositionRow[];
  streams: readonly HydratedStream[];
  waitingRequests: readonly RestingRequestRow[];
  nowSeconds: bigint;
  sort: CollectionSort;
  onSort: (sort: CollectionSort) => void;
  onOpenLoan: (lending: Address, id: bigint) => void;
  onOpenPosition: (lending: Address, id: bigint) => void;
  onOpenStream: (id: bigint) => void;
}) {
  const cards: CollectionCard[] =
    type === "loan"
      ? loanCards(loans, waitingRequests, sort, onOpenLoan, onOpenStream)
      : type === "fixed"
        ? supplyCards(positions, sort, onOpenPosition)
        : streamCards(streams, nowSeconds, sort, onOpenStream);

  const titles = {
    loan: "Self-Repaying Loans",
    fixed: "Fixed Returns",
    stream: "Your streams",
  } as const;
  const count = cards.length;
  const noun = type === "stream" ? "stream" : type === "loan" ? "loan" : "position";

  return (
    <PortfolioCollection
      title={titles[type]}
      countLabel={`${count} ${noun}${count === 1 ? "" : "s"}`}
      cards={cards}
      sort={sort}
      onSort={onSort}
    />
  );
}

function loanCards(
  loans: readonly BorrowerLoanRow[],
  waitingRequests: readonly RestingRequestRow[],
  sort: CollectionSort,
  onOpenLoan: (lending: Address, id: bigint) => void,
  onOpenStream: (id: bigint) => void,
): CollectionCard[] {
  const waiting: CollectionCard[] = waitingRequests.map((request) => ({
    id: `waiting-${request.book}-${request.requestId.toString()}`,
    hrefTitle: `WAITING · STREAM #${request.streamId.toString()}`,
    status: "Waiting",
    facts: [
      { label: "Target", value: formatAmount(request.targetBorrow) },
      { label: "APR", value: formatAprBps(request.aprBps) },
    ],
    segments: loanCapsuleSegments(
      { waiting: true, waitingAmount: request.targetBorrow, obligation: 0n, outstanding: 0n },
      formatAmount,
    ),
    onOpen: () => onOpenStream(request.streamId),
  }));
  const sortedLoans = [...loans].sort((left, right) =>
    compareCollectionRows(
      { id: left.id, status: loanLifecycle(left), amount: left.outstanding },
      { id: right.id, status: loanLifecycle(right), amount: right.outstanding },
      sort,
    ),
  );
  const loanCardsRows: CollectionCard[] = sortedLoans.map((loan) => ({
    id: `${loan.lending}-${loan.id.toString()}`,
    hrefTitle: `LOAN #${loan.id.toString()}`,
    status: lifecycleLabel(loanLifecycle(loan)),
    facts: [
      { label: "Remaining", value: formatAmount(loan.outstanding) },
      { label: "Obligation", value: formatAmount(loan.obligation) },
    ],
    segments: loanCapsuleSegments(
      { obligation: loan.obligation, outstanding: loan.outstanding },
      formatAmount,
    ),
    onOpen: () => onOpenLoan(loan.lending, loan.id),
  }));
  return [...waiting, ...loanCardsRows];
}

function supplyCards(
  positions: readonly LenderPositionRow[],
  sort: CollectionSort,
  onOpenPosition: (lending: Address, id: bigint) => void,
): CollectionCard[] {
  const sorted = [...positions].sort((left, right) =>
    compareCollectionRows(
      {
        id: left.id,
        status: supplyLifecycle(left),
        amount: positionFilled(left) + left.availableLiquidity,
      },
      {
        id: right.id,
        status: supplyLifecycle(right),
        amount: positionFilled(right) + right.availableLiquidity,
      },
      sort,
    ),
  );
  return sorted.map((position) => {
    const filled = positionFilled(position);
    const unmatched = position.availableLiquidity;
    const arrived = positionClaimable(position);
    const arriving = filled > arrived ? filled - arrived : 0n;
    return {
      id: `${position.lending}-${position.id.toString()}`,
      hrefTitle: `SUPPLY #${position.id.toString()}`,
      status: lifecycleLabel(supplyLifecycle(position)),
      facts: [
        { label: "Supplied", value: formatAmount(filled + unmatched) },
        { label: "APR", value: formatAprBps(position.aprBps) },
      ],
      segments: fixedCapsuleSegments(
        {
          unmatched,
          supplied: filled + unmatched,
          arriving,
          arrived,
          claimed: 0n,
        },
        formatAmount,
      ),
      onOpen: () => onOpenPosition(position.lending, position.id),
    };
  });
}

function streamCards(
  streams: readonly HydratedStream[],
  nowSeconds: bigint,
  sort: CollectionSort,
  onOpenStream: (id: bigint) => void,
): CollectionCard[] {
  const sorted = [...streams].sort((left, right) =>
    compareCollectionRows(
      { id: left.streamId, status: "active", amount: left.remaining },
      { id: right.streamId, status: "active", amount: right.remaining },
      sort,
    ),
  );
  return sorted.map((stream) => {
    const released = interpolateStreamed(stream.schedule, nowSeconds);
    const cap = stream.schedule.deposited - stream.schedule.refunded;
    const releasing = cap > released ? cap - released : 0n;
    return {
      id: stream.streamId.toString(),
      hrefTitle: `STREAM #${stream.streamId.toString()}`,
      status: "Active",
      facts: [
        { label: "Releasing", value: formatAmount(releasing) },
        { label: "Released", value: formatAmount(released) },
      ],
      segments: streamCapsuleSegments({ remaining: releasing, released }, formatAmount),
      onOpen: () => onOpenStream(stream.streamId),
    };
  });
}
