"use client";

import { useState } from "react";
import type { Address } from "viem";
import { ActionButton } from "@/components/kit/ActionButton";
import { Amount } from "@/components/kit/Amount";
import { RollingNumber } from "@/components/kit/RollingNumber";
import { fixedCapsuleSegments } from "@/lib/capsule-segments";
import type { LenderPositionRow } from "@/hooks/useLenderBook";
import { formatAprBps, formatAsOf, formatCoverDate, formatMaturityDate, formatTruncatedDecimal } from "@/lib/format";
import type { Freshness } from "@/lib/freshness";
import type { MarketInfo } from "@/lib/types";
import { positionClaimable, positionFilled, suppliedMatchState } from "@/lib/watch-rows";
import {
  describeFixedReturnCompletion,
  type FixedReturnLoanTerm,
} from "@/lib/fixed-return-completion";
import { namedSurfaceSpec } from "@/lib/named-surface-state";
import { RetiredMarketMarker, DetailShell } from "./PortfolioViews";
import { WatchWrite } from "./WatchWrite";
import "./watch.css";

function formatAmount(value: bigint): string {
  return formatTruncatedDecimal(value, 18, 2);
}

export function SuppliedDetail({
  position,
  symbol,
  underlyingSymbol,
  market,
  lending,
  nowMs,
  freshness,
  signingAllowed,
  usdMode,
  usdAvailable,
  usdText,
  retired = false,
  loanTerms = null,
}: {
  position: LenderPositionRow;
  symbol: string;
  underlyingSymbol?: string;
  market: MarketInfo | null;
  lending: Address | null;
  nowMs: number;
  freshness: Freshness;
  signingAllowed: boolean;
  usdMode: "token" | "usd";
  usdAvailable: boolean;
  usdText?: string;
  retired?: boolean;
  loanTerms?: readonly FixedReturnLoanTerm[] | null;
}) {
  const [write, setWrite] = useState<"claim" | "withdraw" | null>(null);
  const filled = positionFilled(position);
  const unfilled = position.availableLiquidity;
  const supplied = filled + unfilled;
  const claimable = positionClaimable(position);
  const arriving = filled > claimable ? filled - claimable : 0n;
  const match = suppliedMatchState(filled, unfilled);
  const completion = describeFixedReturnCompletion({ filled, unfilled, loans: loanTerms });
  const stale = !signingAllowed;
  const status = match === "resting" ? "Waiting" : match === "partial" ? "Working" : "Active";
  const segments = fixedCapsuleSegments(
    {
      unmatched: unfilled,
      supplied,
      arriving,
      arrived: claimable,
      claimed: 0n,
    },
    formatAmount,
  );
  const facts = [
    { label: "Supplied", value: `${formatTruncatedDecimal(supplied, 18, 5)} ${symbol}` },
    { label: "Filled", value: `${formatTruncatedDecimal(filled, 18, 5)} ${symbol}` },
    { label: "Unfilled", value: `${formatTruncatedDecimal(unfilled, 18, 5)} ${symbol}` },
    { label: "Claimable", value: `${formatTruncatedDecimal(claimable, 18, 5)} ${symbol}` },
    { label: "APR", value: formatAprBps(position.aprBps) },
  ];
  if (completion.status === "waiting") {
    facts.push({ label: "Status", value: "Waiting. Unmatched funds stay withdrawable." });
  }
  if (completion.status === "single-term") {
    facts.push({ label: "Return date", value: formatCoverDate(completion.completionDate) });
  }
  if (completion.status === "multiple-dates") {
    facts.push({ label: "Dates", value: completion.summary });
    for (const loan of completion.loans) {
      facts.push({
        label: `Loan ${loan.loanId.toString()}`,
        value: `${formatTruncatedDecimal(loan.matchedAmount, 18, 5)} · ${formatCoverDate(loan.completionDate)}`,
      });
    }
    if (completion.withdrawableUnfilled) {
      facts.push({ label: "Unfilled suffix", value: "Waiting. Withdrawable." });
    }
  }
  if (market) {
    facts.push({ label: "Maturity", value: formatMaturityDate(market.expiryCached).toUpperCase() });
  }

  return (
    <article data-ui="UI-WATCH-SUPPLIED-DETAIL" data-region="supplied-detail" data-state={match}>
      {retired ? <RetiredMarketMarker /> : null}
      {filled === 0n && unfilled > 0n ? (
        <p className="watch-note" data-named-state="no-borrower-demand-yet">
          {namedSurfaceSpec("no-borrower-demand-yet").copy}
        </p>
      ) : null}
      <DetailShell
        title="Fixed Return"
        status={status}
        segments={segments}
        facts={facts}
        note={freshnessCaption(freshness)}
        actions={
          write && lending && market ? (
            <WatchWrite
              kind={write}
              lending={lending}
              market={market}
              positionId={position.id}
              claimPairs={position.pairs}
              claimable={claimable}
              unfilled={unfilled}
              symbol={symbol}
              underlyingSymbol={underlyingSymbol}
              signingAllowed={signingAllowed}
              onClose={() => setWrite(null)}
            />
          ) : (
            <>
              {filled > 0n ? (
                <>
                  <span className="kit-hero-kicker">YOUR EARNINGS</span>
                  <RollingNumber value={claimable} ticking accent="gold" displayDecimals={8} nowMs={nowMs} />
                  {usdMode === "usd" ? (
                    <Amount
                      token={formatTruncatedDecimal(claimable, 18, 8)}
                      symbol={symbol}
                      usd={usdText}
                      usdAvailable={usdAvailable}
                      mode="usd"
                    />
                  ) : null}
                </>
              ) : null}
              {claimable > 0n ? (
                stale ? (
                  <ActionButton disabled disabledReason="EVENTS STALE — SIGNING DISABLED">
                    {`CLAIM ${formatTruncatedDecimal(claimable, 18, 5)} ${symbol}`}
                  </ActionButton>
                ) : (
                  <ActionButton variant="primary" onClick={() => setWrite("claim")}>
                    {`CLAIM ${formatTruncatedDecimal(claimable, 18, 5)} ${symbol}`}
                  </ActionButton>
                )
              ) : null}
              {unfilled > 0n ? (
                stale ? (
                  <ActionButton disabled disabledReason="EVENTS STALE — SIGNING DISABLED">
                    WITHDRAW UNFILLED
                  </ActionButton>
                ) : (
                  <ActionButton onClick={() => setWrite("withdraw")}>WITHDRAW UNFILLED</ActionButton>
                )
              ) : null}
            </>
          )
        }
      />
    </article>
  );
}

export function freshnessCaption(freshness: Freshness) {
  if (freshness.asOf === null) return "EVENTS UNAVAILABLE";
  const base = formatAsOf(freshness.asOf);
  if (freshness.kind === "degraded") return `DEGRADED — ${base}`;
  return base;
}
