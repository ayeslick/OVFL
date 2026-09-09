"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { WalletButton } from "wallet-runtime";
import { RegionErrorBoundary } from "@/components/ModalErrorBoundary";
import { ConverterFlow } from "@/components/assets/ConverterFlow";
import { HostedConvertPanel } from "@/components/assets/HostedConvertPanel";
import { StreamCreateFlow } from "@/components/assets/StreamCreateFlow";
import { ActionButton } from "@/components/kit/ActionButton";
import { Shell } from "@/components/kit/Shell";
import { StatusLine } from "@/components/kit/StatusLine";
import { SurfaceState } from "@/components/kit/SurfaceState";
import { useAllMarkets } from "@/hooks/useAllMarkets";
import { useChainGuard } from "@/hooks/useChainGuard";
import { useFreshness } from "@/hooks/useFreshness";
import { symbolFor, useMarketSymbols } from "@/hooks/useMarketSymbols";
import { classifySurfaceState } from "@/lib/surface-state";
import { asOfClock } from "@/components/assets/helpers";

export default function CreatePage() {
  const connection = useConnection();
  const queryClient = useQueryClient();
  const chain = useChainGuard();
  const allMarkets = useAllMarkets();
  const symbols = useMarketSymbols(allMarkets.markets);
  const freshness = useFreshness([
    {
      status: allMarkets.isLoading ? "pending" : allMarkets.error ? "error" : "success",
    },
  ]);
  const selected = allMarkets.markets[0] ?? null;
  const underlyingSymbol = selected
    ? symbolFor(symbols, selected.underlying)
    : "the market's underlying";
  const ovrfloSymbol = selected
    ? symbolFor(symbols, selected.ovrfloToken)
    : "the market's ovrflo token";
  const marketStatus = useMemo(() => {
    if (allMarkets.status === "loading") return "loading" as const;
    if (allMarkets.status === "unavailable") return "unavailable" as const;
    if (allMarkets.markets.length === 0) return "empty" as const;
    return "ready" as const;
  }, [allMarkets.markets.length, allMarkets.status]);
  const surface = classifySurfaceState({
    dataStatus:
      marketStatus === "loading"
        ? "loading"
        : marketStatus === "empty"
          ? "empty"
          : marketStatus === "unavailable"
            ? "unavailable"
            : "ready",
    hasLastKnown: marketStatus === "ready",
    stale: !freshness.signingAllowed,
    signingAllowed: freshness.signingAllowed,
  });

  return (
    <Shell
      currentNav="create"
      wallet={<WalletButton />}
      status={
        <StatusLine
          status={freshness.freshness.kind}
          asOf={asOfClock(freshness.freshness.asOf)}
        />
      }
    >
      {connection.status !== "connected" ? (
        <p>CONNECT WALLET to convert underlying or deposit PT.</p>
      ) : null}
      {chain.wrongChain ? (
        <div>
          <p>Wrong network. Switch to the configured chain before signing.</p>
          <ActionButton onClick={chain.switchChain} busy={chain.isSwitching}>
            SWITCH NETWORK
          </ActionButton>
        </div>
      ) : null}
      <SurfaceState
        state={surface}
        topology="create"
        onRefresh={
          surface === "STALE"
            ? () => {
                void queryClient.invalidateQueries();
              }
            : undefined
        }
      />
      <RegionErrorBoundary region="create-stream">
        <StreamCreateFlow
          markets={allMarkets.markets}
          marketsStatus={marketStatus}
          symbolFor={(address) => symbolFor(symbols, address)}
          signingAllowed={freshness.signingAllowed && !chain.wrongChain}
        />
      </RegionErrorBoundary>
      <RegionErrorBoundary region="create-convert">
        <ConverterFlow
          market={selected}
          underlyingSymbol={underlyingSymbol}
          ovrfloSymbol={ovrfloSymbol}
          signingAllowed={freshness.signingAllowed && !chain.wrongChain}
        />
        <HostedConvertPanel
          market={selected}
          signingAllowed={freshness.signingAllowed && !chain.wrongChain}
        />
      </RegionErrorBoundary>
    </Shell>
  );
}
