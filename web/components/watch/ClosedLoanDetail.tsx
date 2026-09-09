"use client";

import type { BorrowerLoanRow } from "@/hooks/useBorrowerBook";
import { loanCapsuleSegments } from "@/lib/capsule-segments";
import { formatTruncatedDecimal } from "@/lib/format";
import type { Freshness } from "@/lib/freshness";
import { freshnessCaption } from "./SuppliedDetail";
import { RetiredMarketMarker, DetailShell } from "./PortfolioViews";
import "./watch.css";

function formatAmount(value: bigint): string {
  return formatTruncatedDecimal(value, 18, 2);
}

export function ClosedLoanDetail({
  loan,
  symbol,
  freshness,
  streamPresent = true,
  onSelectStream,
  retired = false,
}: {
  loan: BorrowerLoanRow;
  symbol: string;
  freshness: Freshness;
  streamPresent?: boolean;
  onSelectStream: (streamId: bigint) => void;
  retired?: boolean;
}) {
  const segments = loanCapsuleSegments(
    { obligation: loan.obligation, outstanding: 0n },
    formatAmount,
  );
  return (
    <article data-ui="UI-WATCH-CLOSED-DETAIL" data-region="settled-detail" data-state="settled">
      {retired ? <RetiredMarketMarker /> : null}
      <DetailShell
        title="Completed loan"
        status="Completed"
        segments={segments}
        facts={[
          { label: "Obligation", value: `${formatTruncatedDecimal(loan.obligation, 18, 5)} ${symbol}` },
          { label: "Repaid", value: `${formatTruncatedDecimal(loan.repaid, 18, 5)} ${symbol}` },
          { label: "Stream", value: `#${loan.streamId.toString()}` },
        ]}
        note={freshnessCaption(freshness)}
        actions={
          <>
            <span className="kit-hero-kicker">SETTLED</span>
            <p className="watch-hero-meta">LOAN #{loan.id.toString()}</p>
            <button type="button" className="kit-text-button" onClick={() => onSelectStream(loan.streamId)}>
              {streamPresent
                ? `RETURNED STREAM #${loan.streamId.toString()}`
                : `STREAM #${loan.streamId.toString()} GONE`}
            </button>
            <p className="watch-note" data-named-state="completed-position">
              This settled loan stays on Your OVRFLO.
            </p>
          </>
        }
      />
    </article>
  );
}
