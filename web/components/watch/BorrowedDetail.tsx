"use client";

import { useState } from "react";
import type { Address } from "viem";
import { ActionButton } from "@/components/kit/ActionButton";
import { Amount } from "@/components/kit/Amount";
import { RollingNumber } from "@/components/kit/RollingNumber";
import { loanCapsuleSegments } from "@/lib/capsule-segments";
import type { BorrowerLoanRow } from "@/hooks/useBorrowerBook";
import { formatCoverDate, formatTruncatedDecimal } from "@/lib/format";
import type { Freshness } from "@/lib/freshness";
import type { StreamSchedule } from "@/lib/payoff";
import type { MarketInfo } from "@/lib/types";
import {
  borrowedRowState,
  displayedOutstanding,
  loanCoverAt,
  loanOutstanding,
} from "@/lib/watch-rows";
import { freshnessCaption } from "./SuppliedDetail";
import { RetiredMarketMarker, DetailShell } from "./PortfolioViews";
import { WatchWrite } from "./WatchWrite";
import "./watch.css";

function formatAmount(value: bigint): string {
  return formatTruncatedDecimal(value, 18, 2);
}

export function BorrowedDetail({
  loan,
  symbol,
  underlyingSymbol,
  market,
  lending,
  nowSeconds,
  nowMs,
  lastReadAt,
  schedule,
  withdrawable,
  freshness,
  signingAllowed,
  usdMode,
  usdAvailable,
  usdText,
  onSelectStream,
  retired = false,
}: {
  loan: BorrowerLoanRow;
  symbol: string;
  underlyingSymbol?: string;
  market: MarketInfo | null;
  lending: Address | null;
  nowSeconds: bigint;
  nowMs: number;
  lastReadAt: bigint;
  schedule?: StreamSchedule;
  withdrawable?: bigint;
  freshness: Freshness;
  signingAllowed: boolean;
  usdMode: "token" | "usd";
  usdAvailable: boolean;
  usdText?: string;
  onSelectStream: (streamId: bigint) => void;
  retired?: boolean;
}) {
  const [write, setWrite] = useState<"repay" | "close" | null>(null);
  const state = borrowedRowState({ loan, withdrawable });
  const closeReady = state === "close-ready";
  const outstanding = displayedOutstanding({
    schedule,
    lastOutstanding: loan.outstanding,
    lastReadAt,
    now: nowSeconds,
    closeReady,
  });
  const coverAt = loanCoverAt(schedule, loanOutstanding(loan), nowSeconds);
  const stale = !signingAllowed;
  const status = closeReady ? "Active" : loan.outstanding === 0n ? "Completed" : "Active";
  const segments = loanCapsuleSegments(
    { obligation: loan.obligation, outstanding: loan.outstanding },
    formatAmount,
  );

  return (
    <article data-ui="UI-WATCH-BORROWED-DETAIL" data-region="borrowed-detail" data-state={state}>
      {retired ? <RetiredMarketMarker /> : null}
      <DetailShell
        title="Self-Repaying Loan"
        status={status}
        segments={segments}
        facts={[
          { label: "Remaining", value: `${formatAmount(loan.outstanding)} ${symbol}` },
          { label: "Repaid", value: `${formatAmount(loan.obligation - loan.outstanding)} ${symbol}` },
          { label: "Net proceeds", value: `${formatTruncatedDecimal(loan.drawn, 18, 5)} ${symbol}` },
          { label: "Obligation", value: `${formatTruncatedDecimal(loan.obligation, 18, 5)} ${symbol}` },
          { label: "Pledged stream", value: `#${loan.streamId.toString()}` },
          {
            label: "Done date",
            value: !schedule ? "Checking…" : coverAt ? formatCoverDate(coverAt) : "Uncovered",
          },
        ]}
        note={freshnessCaption(freshness)}
        actions={
          write && lending && market ? (
            <WatchWrite
              kind={write}
              lending={lending}
              market={market}
              loanId={loan.id}
              outstanding={loan.outstanding}
              withdrawable={withdrawable}
              symbol={symbol}
              underlyingSymbol={underlyingSymbol}
              signingAllowed={signingAllowed}
              schedule={schedule}
              nowSeconds={nowSeconds}
              onClose={() => setWrite(null)}
            />
          ) : (
            <>
              <RollingNumber
                value={outstanding}
                schedule={
                  schedule && !closeReady
                    ? {
                        startMs: Number(lastReadAt) * 1000,
                        endMs: coverAt
                          ? Number(coverAt) * 1000
                          : Number(schedule.end) * 1000,
                        startAmount: loan.outstanding,
                        endAmount: 0n,
                      }
                    : undefined
                }
                ticking={!closeReady}
                nowMs={nowMs}
                displayDecimals={8}
              />
              {usdMode === "usd" ? (
                <Amount
                  token={formatTruncatedDecimal(outstanding, 18, 8)}
                  symbol={symbol}
                  usd={usdText}
                  usdAvailable={usdAvailable}
                  mode="usd"
                />
              ) : null}
              {loan.outstanding > 0n ? (
                stale ? (
                  <ActionButton disabled disabledReason="EVENTS STALE — SIGNING DISABLED">
                    REPAY
                  </ActionButton>
                ) : (
                  <ActionButton onClick={() => setWrite("repay")}>REPAY</ActionButton>
                )
              ) : null}
              {closeReady ? (
                stale ? (
                  <ActionButton disabled disabledReason="EVENTS STALE — SIGNING DISABLED">
                    CLOSE FROM STREAM
                  </ActionButton>
                ) : (
                  <ActionButton variant="primary" onClick={() => setWrite("close")}>
                    CLOSE FROM STREAM
                  </ActionButton>
                )
              ) : null}
              <button type="button" className="kit-text-button" onClick={() => onSelectStream(loan.streamId)}>
                View stream #{loan.streamId.toString()}
              </button>
            </>
          )
        }
      />
    </article>
  );
}
