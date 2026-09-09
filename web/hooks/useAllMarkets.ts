"use client";

import type { MarketInfo } from "@/lib/types";
import { useOvrflos } from "./useOvrflos";

export function useAllMarkets() {
  const ovrflos = useOvrflos();

  if (ovrflos.status === "loading") {
    return {
      markets: [] as MarketInfo[],
      tooLarge: false,
      status: "loading" as const,
      isLoading: true,
      error: null as Error | null,
    };
  }

  if (ovrflos.status === "unavailable") {
    return {
      markets: [] as MarketInfo[],
      tooLarge: ovrflos.tooLarge,
      status: "unavailable" as const,
      isLoading: false,
      error: ovrflos.error,
    };
  }

  return {
    markets: [...ovrflos.bootstrap.markets],
    tooLarge: false,
    status: "ready" as const,
    isLoading: false,
    error: null as Error | null,
  };
}
