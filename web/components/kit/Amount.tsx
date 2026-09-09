"use client";

import "./kit.css";

export function Amount({
  token,
  symbol,
  usd,
  usdAvailable,
  mode = "token",
}: {
  token: string;
  symbol: string;
  usd?: string;
  usdAvailable: boolean;
  mode?: "token" | "usd";
}) {
  const showUsd = mode === "usd" && usdAvailable && Boolean(usd);
  return (
    <span
      className="kit-amount"
      data-mode={showUsd ? "usd" : "token"}
      data-state={usdAvailable ? "ready" : "token-only"}
    >
      <span className="kit-amount-token">
        {token} {symbol}
      </span>
      {showUsd ? <span className="kit-amount-usd">{usd}</span> : null}
    </span>
  );
}
