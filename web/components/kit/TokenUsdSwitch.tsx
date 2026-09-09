"use client";

import "./kit.css";

export type TokenUsdMode = "token" | "usd";

export function TokenUsdSwitch({
  mode,
  tokenLabel,
  usdAvailable,
  onChange,
}: {
  mode: TokenUsdMode;
  tokenLabel: string;
  usdAvailable: boolean;
  onChange: (mode: TokenUsdMode) => void;
}) {
  if (!usdAvailable) return null;
  return (
    <button
      type="button"
      className="kit-switch"
      data-state={mode}
      data-ui="UI-SHELL-TOKEN-USD"
      aria-label="Token or USD display"
      onClick={() => {
        onChange(mode === "token" ? "usd" : "token");
      }}
    >
      <span data-on={mode === "token" ? "true" : "false"}>{tokenLabel}</span>
      <span data-on={mode === "usd" ? "true" : "false"}>USD</span>
    </button>
  );
}
