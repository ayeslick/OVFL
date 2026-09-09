"use client";

import { useSyncExternalStore } from "react";
import { SurfaceHeading } from "./SurfaceHeading";
import { getDisclosure, subscribeDisclosure, toggleDisclosure } from "@/lib/disclosure";
import "./kit.css";
import "./surfaces.css";

export function CreateChooser({
  title,
  showHelp = false,
}: {
  title: string;
  showHelp?: boolean;
}) {
  const disclosure = useSyncExternalStore(subscribeDisclosure, getDisclosure, getDisclosure);
  const modeLabel = disclosure === "advanced" ? "Return to Default" : "Go to Advanced";
  return (
    <section className="kit-empty-layout default-hub" data-ui="UI-SHELL-HUB">
      <header className="default-hub-welcome">
        <SurfaceHeading>{title}</SurfaceHeading>
      </header>
      <div className="kit-create-choices default-hub-types">
        <a className="kit-create-choice kit-card kit-type-card" href="/borrow/" data-type="loan">
          <span className="kit-medallion" data-identity="loan" aria-hidden="true" />
          <h3>Self-Repaying Loan</h3>
          <p>Access liquidity now. Your pledged stream repays the loan over time.</p>
          <span className="kit-text-button">Create a loan</span>
        </a>
        <a className="kit-create-choice kit-card kit-type-card" href="/supply/" data-type="fixed">
          <span className="kit-medallion" data-identity="fixed" aria-hidden="true" />
          <h3>Fixed Return</h3>
          <p>Supply an OVRFLO asset at your chosen APR. Unmatched funds remain withdrawable.</p>
          <span className="kit-text-button">Create a fixed return</span>
        </a>
        <a className="kit-create-choice kit-card kit-type-card" href="/create/stream/" data-type="stream">
          <span className="kit-medallion" data-identity="stream" aria-hidden="true" />
          <h3>Stream</h3>
          <p>Receive tokens now, with more releasing over time.</p>
          <span className="kit-text-button">Create a stream</span>
        </a>
      </div>
      {showHelp ? (
        <aside className="default-hub-help">
          <h3>Help</h3>
          <p>Need exact controls for this destination?</p>
          <button type="button" className="kit-mode" data-ui="UI-SHELL-MODE" data-location="help" onClick={toggleDisclosure}>
            {modeLabel}
          </button>
        </aside>
      ) : null}
    </section>
  );
}

export function DefaultHub({
  welcome,
  help,
}: {
  welcome: string;
  help?: string;
}) {
  return <CreateChooser title={welcome} showHelp />;
}
