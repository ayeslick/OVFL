"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getDisclosure, subscribeDisclosure, toggleDisclosure } from "@/lib/disclosure";
import {
  getWatchSearchServerSnapshot,
  getWatchSearchSnapshot,
  stripLensFromLocation,
  subscribeWatchUrl,
} from "@/lib/watch-url";
import { NetworkChip } from "./NetworkChip";
import { RefetchNotice } from "./RefetchNotice";
import "./kit.css";
import "./surfaces.css";

export type ShellNavId = "home" | "create";

function StripRetiredLens() {
  const search = useSyncExternalStore(
    subscribeWatchUrl,
    getWatchSearchSnapshot,
    getWatchSearchServerSnapshot,
  );
  useEffect(() => {
    stripLensFromLocation();
  }, [search]);
  return null;
}

function ModeControl({ location }: { location: "account" | "menu" }) {
  const disclosure = useSyncExternalStore(subscribeDisclosure, getDisclosure, getDisclosure);
  if (disclosure !== "advanced") return null;
  return (
    <button
      type="button"
      className="kit-mode"
      data-ui="UI-SHELL-MODE"
      data-location={location}
      data-disclosure={disclosure}
      onClick={toggleDisclosure}
    >
      Return to Default
    </button>
  );
}

export function Shell({
  children,
  currentNav,
  wallet,
  network,
  status,
}: {
  children?: ReactNode;
  currentNav?: ShellNavId | null;
  wallet?: ReactNode;
  network?: ReactNode;
  status?: ReactNode;
}) {
  const disclosure = useSyncExternalStore(subscribeDisclosure, getDisclosure, getDisclosure);

  return (
    <div className="kit kit-shell" data-disclosure={disclosure} data-ui="UI-SHELL">
      <StripRetiredLens />
      <header className="kit-shell-header">
        <h1 className="kit-wordmark">
          <a href="/" data-ui="UI-SHELL-BRAND" aria-current={currentNav === "home" ? "page" : undefined}>
            <img src="/images/ovrflo-logo.jpeg" alt="" width={56} height={56} />
            <span>OVRFLO</span>
          </a>
        </h1>
        <div className="kit-shell-account">
          <div className="kit-shell-network">{network ?? <NetworkChip />}</div>
          <div className="kit-shell-wallet">{wallet}</div>
          <ModeControl location="account" />
        </div>
        <details className="kit-menu" data-ui="UI-SHELL-MENU">
          <summary>Menu</summary>
          <nav className="kit-menu-nav" aria-label="Default" data-ui="UI-SHELL-NAV">
            <a href="/" data-current={currentNav === "home" ? "true" : "false"} aria-current={currentNav === "home" ? "page" : undefined}>
              Your OVRFLO
            </a>
            <a href="/create/" data-current={currentNav === "create" ? "true" : "false"} aria-current={currentNav === "create" ? "page" : undefined}>
              New position
            </a>
            <ModeControl location="menu" />
          </nav>
        </details>
      </header>
      <div className="kit-shell-body">
        {status}
        <RefetchNotice />
        {children}
      </div>
    </div>
  );
}
