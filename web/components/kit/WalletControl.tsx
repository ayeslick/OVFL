"use client";

import { CopyValue } from "@/components/CopyValue";
import { formatAddress } from "@/lib/format";
import "./kit.css";

function WalletDot() {
  return <span className="kit-wallet-dot" aria-hidden="true" />;
}

function WalletChevron() {
  return <span className="kit-wallet-chevron" aria-hidden="true" />;
}

export function WalletConnectControl({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick?: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className="kit-wallet"
      data-ui="UI-SHELL-WALLET"
      data-state="disconnected"
      disabled={disabled}
      onClick={onClick}
    >
      <WalletDot />
      {children}
      <WalletChevron />
    </button>
  );
}

export function WalletConnectedControl({
  address,
  onDisconnect,
}: {
  address: string;
  onDisconnect: () => void;
}) {
  return (
    <span className="kit-wallet" data-ui="UI-SHELL-WALLET" data-state="connected">
      <WalletDot />
      <CopyValue
        className="kit-wallet-address"
        ui="UI-SHELL-ADDRESS-COPY"
        value={address}
        display={formatAddress(address)}
        label="Copy wallet address"
      />
      <button type="button" className="kit-wallet-leave" onClick={onDisconnect}>
        DISCONNECT
      </button>
    </span>
  );
}
