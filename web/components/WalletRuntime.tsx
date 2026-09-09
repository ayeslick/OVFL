"use client";

import { useConnect, useConnection, useDisconnect } from "wagmi";
import type { Config } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { formatAddress } from "@/lib/format";
import { CopyValue } from "./CopyValue";

// Production wallet runtime, and one half of the app's only test seam.
// Everything wallet-specific lives behind the `wallet-runtime` specifier.
// E2E resolves that specifier to tests/e2e/support/WalletRuntime.tsx.

export const walletConfig: Config = wagmiConfig;

export function ensureWalletKit() {}

export function WalletButton() {
  const connection = useConnection();
  const { disconnect } = useDisconnect();
  const { connect, connectors, isPending } = useConnect();
  const connected = connection.status === "connected";
  const address = connection.addresses?.[0];
  const wallets = connectors.filter((connector) => connector.type === "injected");

  if (connected) {
    return (
      <span className="wallet-identity">
        <CopyValue value={address ?? ""} display={formatAddress(address)} label="Copy wallet address" />
        <button className="button mono" type="button" onClick={() => disconnect()}>
          DISCONNECT
        </button>
      </span>
    );
  }

  if (wallets.length === 0) {
    return (
      <button className="button mono" type="button" disabled>
        NO INJECTED WALLET
      </button>
    );
  }

  if (wallets.length === 1) {
    const wallet = wallets[0]!;
    return (
      <button
        className="button mono"
        type="button"
        disabled={isPending}
        onClick={() => connect({ connector: wallet })}
      >
        CONNECT WALLET
      </button>
    );
  }

  return (
    <span className="wallet-identity">
      {wallets.map((wallet) => (
        <button
          key={wallet.uid}
          className="button mono"
          type="button"
          disabled={isPending}
          onClick={() => connect({ connector: wallet })}
        >
          {`CONNECT ${wallet.name}`.toUpperCase()}
        </button>
      ))}
    </span>
  );
}
