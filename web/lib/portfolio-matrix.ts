import type { Address } from "viem";
import type { PortfolioType } from "./parse";
import type { WatchSelection, WatchUrlState } from "./watch-url";

export type PortfolioIdentity = {
  lending: Address;
  id: bigint;
};

export type WaitingRequestIdentity = {
  lending: Address;
  requestId: bigint;
  streamId: bigint;
};

export type PortfolioHydration = {
  complete: boolean;
  loans: readonly PortfolioIdentity[];
  positions: readonly PortfolioIdentity[];
  waitingRequests?: readonly WaitingRequestIdentity[];
  streams?: readonly bigint[];
};

export type PortfolioSurface =
  | { kind: "incomplete" }
  | { kind: "empty" }
  | { kind: "hub" }
  | { kind: "collection"; type: PortfolioType }
  | {
      kind: "detail";
      selection: Extract<WatchSelection, { kind: "loan" | "position" | "stream" }>;
    };

export type PortfolioSearchApply =
  | { action: "skip" }
  | { action: "write"; type: PortfolioType | null; selection: WatchSelection };

function sameIdentity(left: PortfolioIdentity, right: PortfolioIdentity): boolean {
  return left.id === right.id && left.lending.toLowerCase() === right.lending.toLowerCase();
}

export function ownsIdentity(
  rows: readonly PortfolioIdentity[],
  lending: Address,
  id: bigint,
): boolean {
  return rows.some((row) => sameIdentity(row, { lending, id }));
}

export function ownsWaitingStream(
  rows: readonly WaitingRequestIdentity[],
  streamId: bigint,
): boolean {
  return rows.some((row) => row.streamId === streamId);
}

export function ownsWalletStream(streams: readonly bigint[], streamId: bigint): boolean {
  return streams.some((id) => id === streamId);
}

function typeCounts(
  loans: readonly PortfolioIdentity[],
  positions: readonly PortfolioIdentity[],
  waitingRequests: readonly WaitingRequestIdentity[],
  streams: readonly bigint[],
) {
  return {
    loan: loans.length + waitingRequests.length,
    fixed: positions.length,
    stream: streams.length,
  };
}

export function matrixFromCounts(
  loans: readonly PortfolioIdentity[],
  positions: readonly PortfolioIdentity[],
  waitingRequests: readonly WaitingRequestIdentity[] = [],
  streams: readonly bigint[] = [],
): Exclude<PortfolioSurface, { kind: "incomplete" }> {
  const counts = typeCounts(loans, positions, waitingRequests, streams);
  const present = (["loan", "fixed", "stream"] as const).filter((type) => counts[type] > 0);
  const total = counts.loan + counts.fixed + counts.stream;
  if (total === 0) return { kind: "empty" };
  if (total === 1) {
    if (counts.loan === 1) {
      const loan = loans[0];
      if (loan) return { kind: "detail", selection: { kind: "loan", lending: loan.lending, id: loan.id } };
      const request = waitingRequests[0];
      if (!request) return { kind: "empty" };
      return { kind: "detail", selection: { kind: "stream", id: request.streamId } };
    }
    if (counts.fixed === 1) {
      const position = positions[0];
      if (!position) return { kind: "empty" };
      return {
        kind: "detail",
        selection: { kind: "position", lending: position.lending, id: position.id },
      };
    }
    const streamId = streams[0];
    if (streamId === undefined) return { kind: "empty" };
    return { kind: "detail", selection: { kind: "stream", id: streamId } };
  }
  if (present.length === 1) {
    const only = present[0];
    if (only) return { kind: "collection", type: only };
  }
  return { kind: "hub" };
}

function ownedSelection(
  hydration: PortfolioHydration,
  selection: WatchSelection,
): Extract<WatchSelection, { kind: "loan" | "position" | "stream" }> | null {
  if (selection.kind === "loan" && ownsIdentity(hydration.loans, selection.lending, selection.id)) {
    return selection;
  }
  if (
    selection.kind === "position" &&
    ownsIdentity(hydration.positions, selection.lending, selection.id)
  ) {
    return selection;
  }
  if (selection.kind === "stream") {
    if (ownsWaitingStream(hydration.waitingRequests ?? [], selection.id)) return selection;
    if (ownsWalletStream(hydration.streams ?? [], selection.id)) return selection;
  }
  return null;
}

function collectionFromType(
  hydration: PortfolioHydration,
  type: PortfolioType | null,
): PortfolioType | null {
  const waiting = hydration.waitingRequests ?? [];
  const streams = hydration.streams ?? [];
  const counts = typeCounts(hydration.loans, hydration.positions, waiting, streams);
  const present = (["loan", "fixed", "stream"] as const).filter((row) => counts[row] > 0);
  if (type === null || counts[type] === 0) return null;
  if (present.length === 1 && counts[type] === 1) return null;
  return type;
}

export function classifyPortfolio(
  hydration: PortfolioHydration,
  url: Pick<WatchUrlState, "type" | "selection">,
): PortfolioSurface {
  if (!hydration.complete) return { kind: "incomplete" };
  const waiting = hydration.waitingRequests ?? [];
  const streams = hydration.streams ?? [];
  const owned = ownedSelection(hydration, url.selection);
  if (owned) return { kind: "detail", selection: owned };
  const collectionType = collectionFromType(hydration, url.type);
  if (collectionType) return { kind: "collection", type: collectionType };
  return matrixFromCounts(hydration.loans, hydration.positions, waiting, streams);
}

export function applyPortfolioSearch(
  hydration: PortfolioHydration,
  url: Pick<WatchUrlState, "type" | "selection">,
): PortfolioSearchApply {
  if (!hydration.complete) return { action: "skip" };
  if (url.selection.kind === "stream") {
    return { action: "write", type: null, selection: url.selection };
  }
  const surface = classifyPortfolio(hydration, url);
  if (surface.kind === "incomplete") return { action: "skip" };
  if (surface.kind === "empty" || surface.kind === "hub") {
    return { action: "write", type: null, selection: { kind: "none" } };
  }
  if (surface.kind === "collection") {
    return { action: "write", type: surface.type, selection: { kind: "none" } };
  }
  return { action: "write", type: null, selection: surface.selection };
}
