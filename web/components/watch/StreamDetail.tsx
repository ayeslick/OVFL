"use client";

import { ActionButton } from "@/components/kit/ActionButton";
import { Amount } from "@/components/kit/Amount";
import { RollingNumber } from "@/components/kit/RollingNumber";
import { streamCapsuleSegments } from "@/lib/capsule-segments";
import type { HydratedStream } from "@/hooks/useStreams";
import { formatMaturityDate, formatTruncatedDecimal } from "@/lib/format";
import type { Freshness } from "@/lib/freshness";
import { buildLedgerCardSnapshot } from "@/lib/ledger-card";
import { interpolateStreamed } from "@/lib/payoff";
import { streamRowState } from "@/lib/watch-rows";
import { StreamLedgerCard } from "./StreamLedgerCard";
import { freshnessCaption } from "./SuppliedDetail";
import { DetailShell } from "./PortfolioViews";
import "./watch.css";

function formatAmount(value: bigint): string {
  return formatTruncatedDecimal(value, 18, 2);
}

export function StreamDetail({
  stream,
  symbol,
  pledgedLoanId,
  nowSeconds,
  nowMs,
  lastReadAt,
  freshness,
  signingAllowed,
  usdMode,
  usdAvailable,
  usdText,
  onSelectLoan,
}: {
  stream: HydratedStream;
  symbol: string;
  pledgedLoanId?: bigint;
  nowSeconds: bigint;
  nowMs: number;
  lastReadAt: bigint;
  freshness: Freshness;
  signingAllowed: boolean;
  usdMode: "token" | "usd";
  usdAvailable: boolean;
  usdText?: string;
  onSelectLoan: (loanId: bigint) => void;
}) {
  const pledged = pledgedLoanId !== undefined;
  const state = streamRowState(stream, pledged);
  const released = interpolateStreamed(stream.schedule, nowSeconds);
  const cap = stream.schedule.deposited - stream.schedule.refunded;
  const releasing = cap > released ? cap - released : 0n;
  const stale = !signingAllowed;
  const startMs = Number(stream.schedule.start) * 1000;
  const endMs = Number(stream.schedule.end) * 1000;
  const snapshot = buildLedgerCardSnapshot({
    streamId: stream.streamId,
    statusCode: stream.status,
    schedule: stream.schedule,
    asOf: lastReadAt,
  });
  const segments = streamCapsuleSegments({ remaining: releasing, released }, formatAmount);

  return (
    <article
      data-ui="UI-WATCH-STREAM-DETAIL"
      data-region="stream-detail"
      data-state={state}
      aria-label={`Stream ${stream.streamId.toString()} ${snapshot.statusLabel}`}
    >
      <DetailShell
        title="Stream"
        status={pledged ? "Active" : "Active"}
        segments={segments}
        facts={[
          { label: "Released", value: `${formatTruncatedDecimal(released, 18, 5)} ${symbol}` },
          { label: "Releasing", value: `${formatTruncatedDecimal(releasing, 18, 5)} ${symbol}` },
          { label: "Maturity", value: formatMaturityDate(stream.schedule.end).toUpperCase() },
          { label: "Transferable", value: pledged ? "NO — PLEDGED" : "YES" },
          { label: "Pledged", value: pledged ? "YES" : "NO" },
        ]}
        note={freshnessCaption(freshness)}
        actions={
          <>
            <span className="kit-hero-kicker">VESTED</span>
            <RollingNumber
              schedule={{
                startMs,
                endMs,
                startAmount: 0n,
                endAmount: stream.schedule.deposited - stream.schedule.refunded,
              }}
              ticking
              nowMs={nowMs}
              displayDecimals={8}
            />
            {usdMode === "usd" ? (
              <Amount
                token={formatTruncatedDecimal(released, 18, 8)}
                symbol={symbol}
                usd={usdText}
                usdAvailable={usdAvailable}
                mode="usd"
              />
            ) : null}
            {state === "eligible" ? (
              stale ? (
                <ActionButton disabled disabledReason="EVENTS STALE — SIGNING DISABLED">
                  BORROW AGAINST THIS STREAM
                </ActionButton>
              ) : (
                <ActionButton
                  onClick={() => {
                    window.location.assign(`/borrow/?stream=${stream.streamId.toString()}`);
                  }}
                >
                  BORROW AGAINST THIS STREAM
                </ActionButton>
              )
            ) : null}
            {pledged && pledgedLoanId !== undefined ? (
              <ActionButton onClick={() => onSelectLoan(pledgedLoanId)}>
                {`LOAN #${pledgedLoanId.toString()}`}
              </ActionButton>
            ) : null}
          </>
        }
      >
        <StreamLedgerCard
          key={snapshot.cacheKey}
          streamId={stream.streamId}
          symbol={symbol}
          endTime={stream.schedule.end}
          snapshot={snapshot}
        />
      </DetailShell>
    </article>
  );
}

export function StreamClosedDetail({ streamId }: { streamId: bigint }) {
  return (
    <article
      data-ui="UI-WATCH-STREAM-DETAIL"
      data-region="stream-detail"
      data-state="closed"
      aria-label={`Stream ${streamId.toString()} closed`}
    >
      <p className="watch-kicker">STREAM CLOSED</p>
      <p className="watch-degraded">
        Stream #{streamId.toString()} is no longer held. The NFT was burned or left this wallet.
      </p>
    </article>
  );
}
