"use client";

import type { ReactNode } from "react";
import { Capsule, CapsuleLegend } from "@/components/kit/Capsule";
import { SurfaceHeading } from "@/components/kit/SurfaceHeading";
import type { CapsuleSegment } from "@/lib/capsule-segments";
import type { PortfolioType } from "@/lib/parse";
import { formatTruncatedDecimal } from "@/lib/format";
import { KD7_RETIRED_MARKET_COPY } from "@/lib/named-surface-state";
import type { CollectionSort, UnderlyingTotal } from "@/lib/portfolio-status";
import { KitBackLink } from "@/components/kit/KitBackLink";
import { CreateChooser } from "@/components/kit/DefaultHub";
import "@/components/kit/surfaces.css";

export function PortfolioEmpty({ state = "ready" }: { state?: "start" | "ready" }) {
  return (
    <div data-ui="UI-WATCH-EMPTY" data-state={state}>
      <CreateChooser title="Your OVRFLO starts here." returnHref="/" />
      <a className="kit-vh" href="/create/" data-ui="UI-WATCH-EMPTY-CREATE">
        Create
      </a>
    </div>
  );
}

export function PortfolioIncomplete({
  children,
  streamsDegraded,
}: {
  children?: ReactNode;
  streamsDegraded?: ReactNode;
}) {
  return (
    <section className="watch-portfolio" data-ui="UI-WATCH-INCOMPLETE">
      <header className="kit-page-heading">
        <div>
          <SurfaceHeading>Your OVRFLO</SurfaceHeading>
          <p>Discovery is still running. Confirmed cards stay visible. This count is not a route.</p>
        </div>
      </header>
      <p className="watch-kicker">INCOMPLETE</p>
      {streamsDegraded}
      {children}
    </section>
  );
}

export type HubGroup = {
  type: PortfolioType;
  count: number;
  valueText: string;
  label: string;
  secondary: string;
};

const GROUP_COPY: Record<PortfolioType, { title: string; footer: string; valueLabel: string }> = {
  loan: {
    title: "Self-Repaying Loans",
    footer: "View loans",
    valueLabel: "Received across your loans",
  },
  fixed: {
    title: "Fixed Returns",
    footer: "View returns",
    valueLabel: "Supplied across your returns",
  },
  stream: {
    title: "Your streams",
    footer: "View streams",
    valueLabel: "Releasing across your streams",
  },
};

export function PortfolioHub({
  groups,
  onOpenCollection,
}: {
  groups: readonly HubGroup[];
  onOpenCollection: (type: PortfolioType) => void;
}) {
  return (
    <section className="default-hub" data-ui="UI-WATCH-HUB">
      <header className="kit-page-heading">
        <div>
          <SurfaceHeading>Your OVRFLO</SurfaceHeading>
          <p>
            {groups.reduce((sum, group) => sum + group.count, 0)} positions total
          </p>
        </div>
        <a className="kit-button" href="/create/">
          New position
        </a>
      </header>
      <div className="kit-groups">
        {groups.map((group) => {
          const copy = GROUP_COPY[group.type];
          const noun =
            group.type === "stream" ? "stream" : group.type === "loan" ? "loan" : "position";
          return (
            <button
              key={group.type}
              type="button"
              className="kit-group-card"
              data-type={group.type}
              data-focus-key={`hub-${group.type}`}
              onClick={() => onOpenCollection(group.type)}
            >
              <div>
                <h2>{copy.title}</h2>
                <p className="kit-count">
                  {group.count} {noun}
                  {group.count === 1 ? "" : "s"} total
                </p>
                <p className="kit-group-value">{group.valueText}</p>
                <p className="kit-group-label">{copy.valueLabel}</p>
                <p className="kit-group-secondary">{group.secondary}</p>
                {group.label ? <p className="kit-group-secondary">{group.label}</p> : null}
              </div>
              <span className="kit-group-footer">{copy.footer}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export type CollectionCard = {
  id: string;
  hrefTitle: string;
  status: string;
  facts: readonly { label: string; value: string }[];
  segments: CapsuleSegment[];
  onOpen: () => void;
};

export function PortfolioCollection({
  title,
  countLabel,
  cards,
  sort,
  onSort,
  backHref,
  backLabel,
  onBack,
}: {
  title: string;
  countLabel: string;
  cards: readonly CollectionCard[];
  sort?: CollectionSort;
  onSort?: (sort: CollectionSort) => void;
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <section data-ui="UI-WATCH-COLLECTION">
      {backHref && backLabel ? (
        <KitBackLink href={backHref} onClick={onBack}>
          {backLabel}
        </KitBackLink>
      ) : null}
      <header className="kit-page-heading">
        <div>
          <SurfaceHeading>{title}</SurfaceHeading>
          <p>{countLabel}</p>
        </div>
        {onSort && sort ? (
          <label className="watch-collection-sort">
            Sort
            <select value={sort} onChange={(event) => onSort(event.target.value as CollectionSort)}>
              <option value="id">Identity</option>
              <option value="status">Status</option>
              <option value="amount">Amount</option>
            </select>
          </label>
        ) : null}
      </header>
      <div className="kit-collection">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="kit-position-card"
            aria-label={card.hrefTitle}
            onClick={card.onOpen}
          >
            <div>
              <h2>{card.hrefTitle}</h2>
              <span className="kit-badge" data-state={card.status}>
                {card.status}
              </span>
              <dl className="card-facts">
                {card.facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
              <span className="kit-text-button">View</span>
            </div>
            <Capsule segments={card.segments} compact />
          </button>
        ))}
      </div>
    </section>
  );
}

export function CollectionTotals({ totals }: { totals: readonly UnderlyingTotal[] }) {
  if (totals.length === 0) return null;
  return (
    <ul className="watch-collection-totals" data-ui="UI-WATCH-COLLECTION-TOTALS">
      {totals.map((row) => (
        <li key={`${row.underlying}:${row.symbol}`}>
          {row.count} · {formatTruncatedDecimal(row.amount, 18, 5)} {row.symbol}
        </li>
      ))}
    </ul>
  );
}

export function RetiredMarketMarker() {
  return (
    <p className="watch-retired" data-ui="UI-WATCH-RETIRED" data-named-state="retired-market">
      {KD7_RETIRED_MARKET_COPY}
    </p>
  );
}

export function DetailFacts({
  rows,
}: {
  rows: readonly { label: string; value: string }[];
}) {
  return (
    <dl className="kit-facts">
      {rows.map((row) => (
        <div className="kit-fact" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailShell({
  title,
  status,
  facts,
  note,
  actions,
  segments,
  children,
}: {
  title: string;
  status: string;
  facts: readonly { label: string; value: string }[];
  note?: string;
  actions?: ReactNode;
  segments: CapsuleSegment[];
  children?: ReactNode;
}) {
  return (
    <div className="kit-detail-layout">
      <div className="detail-info">
        <div className="title-block">
          <SurfaceHeading>{title}</SurfaceHeading>
          <div className="badges">
            <span className="kit-badge" data-state={status}>
              {status}
            </span>
          </div>
        </div>
        <DetailFacts rows={facts} />
        {note ? <p className="kit-note">{note}</p> : null}
        {children}
        {actions ? <div className="kit-actions">{actions}</div> : null}
      </div>
      <div className="detail-visual">
        <Capsule segments={segments} />
        <CapsuleLegend segments={segments} />
      </div>
    </div>
  );
}
