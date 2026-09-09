"use client";

import type { Address } from "viem";
import type { ReadOutcome } from "@/lib/read-outcome";
import type { VaultInfo } from "@/lib/types";
import {
  useStreams,
  type StreamBook,
  type StreamMarket,
} from "./useStreams";

/**
 * Complete held-stream set at the enumeration pin. Same atomic lens read as
 * useStreams. BorrowFlow eligibility must use this, never a wall pager.
 */
export function useCompleteStreams(input: {
  account: Address | null | undefined;
  vaults: readonly Pick<VaultInfo, "vault" | "ovrfloToken">[];
  markets: readonly StreamMarket[];
  registryComplete: boolean;
  now: bigint;
  stream?: Address;
}): ReadOutcome<StreamBook> {
  const { hasNextPage, isFetchingNextPage, fetchNextPage, advancePin, ...book } = useStreams(input);
  void hasNextPage;
  void isFetchingNextPage;
  void fetchNextPage;
  void advancePin;
  return book;
}
