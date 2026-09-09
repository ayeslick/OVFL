"use client";

import { useMemo } from "react";
import { WalletButton } from "wallet-runtime";
import { RegionErrorBoundary } from "@/components/ModalErrorBoundary";
import { HostedConvertPanel } from "@/components/assets/HostedConvertPanel";
import { StreamCreateFlow } from "@/components/assets/StreamCreateFlow";
import { ActionButton } from "@/components/kit/ActionButton";
import { CreateFlowBack } from "@/components/kit/CreateFlowBack";
import { Shell } from "@/components/kit/Shell";
import { useAllMarkets } from "@/hooks/useAllMarkets";
import { useChainGuard } from "@/hooks/useChainGuard";
import { useFreshness } from "@/hooks/useFreshness";
import { symbolFor, useMarketSymbols } from "@/hooks/useMarketSymbols";

export default function CreateStreamPage() {
  const chain = useChainGuard();
  const allMarkets = useAllMarkets();
  const symbols = useMarketSymbols(allMarkets.markets);
  const freshness = useFreshness([
    {
      status: allMarkets.isLoading ? "pending" : allMarkets.error ? "error" : "success",
    },
  ]);
  const selected = allMarkets.markets[0] ?? null;
  const marketStatus = useMemo(() => {
    if (allMarkets.status === "loading") return "loading" as const;
    if (allMarkets.status === "unavailable") return "unavailable" as const;
    if (allMarkets.markets.length === 0) return "empty" as const;
    return "ready" as const;
  }, [allMarkets.markets.length, allMarkets.status]);

  return (
    <Shell currentNav="create" wallet={<WalletButton />}>
      <CreateFlowBack />
      {chain.wrongChain ? (
        <div>
          <p>Wrong network. Switch to the configured chain before signing.</p>
          <ActionButton onClick={chain.switchChain} busy={chain.isSwitching}>
            SWITCH NETWORK
          </ActionButton>
        </div>
      ) : null}
      <RegionErrorBoundary region="create-stream">
        <StreamCreateFlow
          markets={allMarkets.markets}
          marketsStatus={marketStatus}
          symbolFor={(address) => symbolFor(symbols, address)}
          signingAllowed={freshness.signingAllowed && !chain.wrongChain}
        />
      </RegionErrorBoundary>
      <RegionErrorBoundary region="create-convert">
        <HostedConvertPanel
          market={selected}
          signingAllowed={freshness.signingAllowed && !chain.wrongChain}
        />
      </RegionErrorBoundary>
    </Shell>
  );
}
