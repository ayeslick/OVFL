"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import {
  isAddressEqual,
  type Address,
} from "viem";
import { useProtocolBootstrap } from "./useProtocolBootstrap";
import { useEnumerationPin } from "./useEnumerationPin";
import { chainId, isConfiguredAddress, lensAddress, ZERO_ADDRESS } from "@/lib/config";
import { MIN_STREAM_AMOUNT } from "@/lib/lending-math";
import { classifyRpcFailure } from "@/lib/rpc";
import { pinnedQuery, QUERY_RETRY, streamBookKeys } from "@/lib/query-keys";
import {
  bookFields,
  duplicateStreamFailure,
  foldStreamIds,
  presentBook,
  unreadBookFailure,
} from "@/lib/stream-book";
import { loadCompleteStreams, type StreamView } from "@/lib/protocol/streams";
import { verifyPinHash, type BlockPin } from "@/lib/protocol/pin";
import {
  loadingOutcome,
  readFailure,
  unavailableOutcome,
  type ReadOutcome,
} from "@/lib/read-outcome";
import type { MarketInfo, VaultInfo } from "@/lib/types";

export type StreamScheduleParams = {
  start: bigint;
  end: bigint;
  deposited: bigint;
  withdrawn: bigint;
  refunded: bigint;
  cliffTime: bigint;
  isCancelable: boolean;
};

export type HydratedStream = {
  streamId: bigint;
  owner: Address;
  sender: Address;
  asset: Address;
  schedule: StreamScheduleParams;
  withdrawable: bigint;
  remaining: bigint;
  /** Lockup.Status enum from statusOf — U9 paints from this. */
  status: number;
  /** Streams lens: vault sender + ovrflo asset. Matured markets stay visible. */
  renderEligible: boolean;
  /** Borrow route: full requireEligible including SeriesMatured + MIN_STREAM_AMOUNT. */
  borrowRouteEligible: boolean;
  vault: Address | null;
  market: Address | null;
};

export type StreamBook = {
  streams: readonly HydratedStream[];
  sourceCount: bigint;
  renderCount: number;
  complete: boolean;
  confirmedEmpty: boolean;
};

export type BookPager = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
};

export type StreamBookResult = ReadOutcome<StreamBook> &
  BookPager & {
    advancePin: () => Promise<void>;
  };

function throwIfUnknownBlock(error: unknown): void {
  if (classifyRpcFailure(error) === "unknown_block") {
    throw error instanceof Error ? error : new Error("unknown block");
  }
}

function throwIfUnknownBlockFailures(
  failures: readonly { message: string }[],
): void {
  for (const failure of failures) {
    throwIfUnknownBlock(failure.message);
  }
}

export type StreamMarket = Pick<
  MarketInfo,
  "vault" | "market" | "ovrfloToken" | "expiryCached"
>;

export function renderEligibleStream(input: {
  sender: Address;
  asset: Address;
  vaults: readonly Pick<VaultInfo, "vault" | "ovrfloToken">[];
}): { eligible: boolean; vault: Address | null } {
  for (const vault of input.vaults) {
    if (
      isAddressEqual(input.sender, vault.vault) &&
      isAddressEqual(input.asset, vault.ovrfloToken)
    ) {
      return { eligible: true, vault: vault.vault };
    }
  }
  return { eligible: false, vault: null };
}

export function borrowRouteEligibleStream(input: {
  sender: Address;
  asset: Address;
  schedule: StreamScheduleParams;
  remaining: bigint;
  now: bigint;
  vaults: readonly Pick<VaultInfo, "vault" | "ovrfloToken">[];
  markets: readonly StreamMarket[];
}): { eligible: boolean; market: Address | null } {
  const identity = renderEligibleStream(input);
  if (!identity.eligible || !identity.vault) return { eligible: false, market: null };
  if (input.schedule.isCancelable) return { eligible: false, market: null };
  if (input.schedule.cliffTime !== input.schedule.start) return { eligible: false, market: null };
  if (input.remaining < MIN_STREAM_AMOUNT) return { eligible: false, market: null };
  const market = input.markets.find(
    (row) =>
      isAddressEqual(row.vault, identity.vault!) &&
      isAddressEqual(row.ovrfloToken, input.asset) &&
      row.expiryCached === input.schedule.end &&
      input.now < row.expiryCached,
  );
  return market
    ? { eligible: true, market: market.market }
    : { eligible: false, market: null };
}

export function hydrateStreamView(
  view: StreamView,
  input: {
    vaults: readonly Pick<VaultInfo, "vault" | "ovrfloToken">[];
    markets: readonly StreamMarket[];
    now: bigint;
  },
): HydratedStream | null {
  const remaining = view.deposited - view.withdrawn - view.refunded;
  if (remaining <= 0n || view.isDepleted) return null;
  const schedule: StreamScheduleParams = {
    start: BigInt(view.startTime),
    end: BigInt(view.endTime),
    deposited: view.deposited,
    withdrawn: view.withdrawn,
    refunded: view.refunded,
    cliffTime: BigInt(view.cliffTime),
    isCancelable: view.isCancelable,
  };
  const render = renderEligibleStream({
    sender: view.sender,
    asset: view.asset,
    vaults: input.vaults,
  });
  if (!render.eligible) return null;
  const borrow = borrowRouteEligibleStream({
    sender: view.sender,
    asset: view.asset,
    schedule,
    remaining,
    now: input.now,
    vaults: input.vaults,
    markets: input.markets,
  });
  return {
    streamId: view.streamId,
    owner: view.owner,
    sender: view.sender,
    asset: view.asset,
    schedule,
    withdrawable: view.withdrawableAmount,
    remaining,
    status: view.status,
    renderEligible: true,
    borrowRouteEligible: borrow.eligible,
    vault: render.vault,
    market: borrow.market,
  };
}

const idlePager: BookPager = {
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: () => undefined,
};

const idleAdvance = {
  advancePin: async () => undefined,
};

/**
 * Wallet-held streams from one atomic lens read. Windowing lives inside
 * loadCompleteStreams after a resource-limit. The pager stays idle.
 */
export function useStreams(input: {
  account: Address | null | undefined;
  vaults: readonly Pick<VaultInfo, "vault" | "ovrfloToken">[];
  markets: readonly StreamMarket[];
  registryComplete: boolean;
  now: bigint;
  /** Present only when factory bootstrap is ready — never a null sentinel. */
  stream?: Address;
}): StreamBookResult {
  const bootstrap = useProtocolBootstrap();
  const pinState = useEnumerationPin();
  const publicClient = usePublicClient({ chainId });
  const discovered =
    input.stream ?? (bootstrap.status === "ready" ? bootstrap.stream : undefined);
  const account = input.account;
  const pin = pinState.pin;
  const lockupConfigured = isConfiguredAddress(discovered ?? null);
  const configured =
    isConfiguredAddress(account ?? null) &&
    lockupConfigured &&
    input.registryComplete &&
    pin !== null &&
    publicClient !== undefined;

  const query = useQuery({
    queryKey: streamBookKeys.complete(
      chainId,
      discovered ?? ZERO_ADDRESS,
      account ?? ZERO_ADDRESS,
      pin?.blockHash ?? null,
    ),
    queryFn: async ({ signal }) => {
      if (!publicClient || !discovered || !account || !pin) {
        throw new Error("stream query ran without a pin");
      }
      const outcome = await loadCompleteStreams(
        publicClient,
        lensAddress,
        account,
        pin,
        { signal, pinMode: pinState.mode },
      );
      if (outcome.status === "unavailable") {
        throwIfUnknownBlockFailures(outcome.failures);
      }
      if (pinState.mode === "number" && outcome.status !== "unavailable") {
        const verified = await verifyPinHash(publicClient, pin);
        if (!verified.ok) {
          throw new Error(verified.message);
        }
      }
      return outcome;
    },
    enabled: configured,
    ...pinnedQuery,
    retry: (failureCount, error) =>
      classifyRpcFailure(error) !== "unknown_block" && failureCount < QUERY_RETRY,
  });

  useEffect(() => {
    if (!query.isError || !query.error) return;
    if (classifyRpcFailure(query.error) === "unknown_block") {
      void pinState.advancePin();
    }
  }, [pinState.advancePin, query.error, query.isError]);

  useEffect(() => {
    if (query.isPlaceholderData || !query.data) return;
    pinState.markFresh();
  }, [pinState.markFresh, query.data, query.isPlaceholderData]);

  const pageStamp = useRef<{ pin: BlockPin; blockTimestamp: bigint | null } | null>(null);
  if (pin && query.data && !query.isPlaceholderData) {
    pageStamp.current = { pin, blockTimestamp: pinState.blockTimestamp };
  }
  const stamp = query.isPlaceholderData ? pageStamp.current : pin
    ? { pin, blockTimestamp: pinState.blockTimestamp }
    : null;
  const meta = {
    dataUpdatedAt: pinState.headUpdatedAt || query.dataUpdatedAt,
    blockNumber: stamp?.pin.blockNumber,
    blockHash: stamp?.pin.blockHash,
    blockTimestamp: stamp?.blockTimestamp ?? undefined,
  };
  const pinControls = { advancePin: pinState.advancePin };

  if (bootstrap.status === "unavailable" && input.stream === undefined) {
    return {
      ...unavailableOutcome(
        bootstrap.failures.map((failure) =>
          readFailure("useStreams", "transport", failure.message),
        ),
        meta,
      ),
      ...idlePager,
      ...idleAdvance,
    };
  }
  if (!configured) {
    return { ...loadingOutcome<StreamBook>(undefined, meta), ...idlePager, ...idleAdvance };
  }
  if (query.isError && !query.data) {
    const message = query.error instanceof Error ? query.error.message : "stream read failed";
    return {
      ...unavailableOutcome([readFailure("useStreams", "transport", message)], meta),
      ...idlePager,
      ...pinControls,
    };
  }
  if (!query.data) {
    return { ...loadingOutcome<StreamBook>(undefined, meta), ...idlePager, ...pinControls };
  }

  const outcome = query.data;
  if (outcome.status === "unavailable") {
    const views = outcome.data?.streams ?? [];
    const streams: HydratedStream[] = [];
    for (const view of views) {
      const hydrated = hydrateStreamView(view, input);
      if (hydrated) streams.push(hydrated);
    }
    const bookForUnavailable = streams.length > 0
      ? {
          streams,
          ...bookFields({
            sourceCount: outcome.data?.total ?? 0n,
            renderCount: streams.length,
            complete: false,
            unresolvedFailures: true,
          }),
        }
      : undefined;
    return {
      ...unavailableOutcome(outcome.failures, meta, bookForUnavailable),
      ...idlePager,
      ...pinControls,
    };
  }
  if (outcome.status !== "ready" && outcome.status !== "partial") {
    return { ...loadingOutcome<StreamBook>(undefined, meta), ...idlePager, ...pinControls };
  }

  const folded = foldStreamIds([{ streams: outcome.data.streams }]);
  const streams: HydratedStream[] = [];
  for (const view of outcome.data.streams) {
    const hydrated = hydrateStreamView(view, input);
    if (hydrated) streams.push(hydrated);
  }
  const unresolved = outcome.status === "partial" || outcome.failures.length > 0 || folded.duplicate !== null;
  const fields = bookFields({
    sourceCount: outcome.data.total,
    renderCount: streams.length,
    complete: !unresolved,
    unresolvedFailures: unresolved,
  });
  const book: StreamBook = { streams, ...fields };
  const bookForUnavailable = streams.length > 0 ? book : undefined;

  if (folded.duplicate !== null) {
    return {
      ...unavailableOutcome([duplicateStreamFailure(folded.duplicate)], meta, bookForUnavailable),
      ...idlePager,
      ...pinControls,
    };
  }
  if (unresolved && streams.length === 0) {
    return {
      ...unavailableOutcome(
        outcome.failures.length > 0
          ? outcome.failures
          : [readFailure("useStreams", "subcall", "complete set had failed rows")],
        meta,
        bookForUnavailable,
      ),
      ...idlePager,
      ...pinControls,
    };
  }
  const freshness = query.isPlaceholderData || pinState.stale ? "stale" : "fresh";
  const failures =
    outcome.failures.length > 0
      ? outcome.failures
      : unresolved
        ? [unreadBookFailure("useStreams")]
        : [];
  return {
    ...presentBook(book, failures, { ...meta, ...outcome.metadata }, freshness),
    ...idlePager,
    ...pinControls,
  };
}

