"use client";

import { useEffect } from "react";
import { rememberCreateReturn } from "@/lib/create-return";
import { KitBackLink } from "./KitBackLink";
import { KitIcon } from "./KitIcon";
import "./kit.css";
import "./surfaces.css";

export function CreateChooser({
  title,
  backHref,
  backLabel,
  returnHref = "/",
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  returnHref?: string;
}) {
  useEffect(() => {
    rememberCreateReturn(returnHref);
  }, [returnHref]);

  return (
    <section className="kit-empty-layout default-hub" data-ui="UI-SHELL-HUB">
      {backHref && backLabel ? <KitBackLink href={backHref}>{backLabel}</KitBackLink> : null}
      <header className="default-hub-welcome">
        <h2 className="kit-surface-heading">{title}</h2>
      </header>
      <div className="kit-create-choices default-hub-types">
        <a className="kit-create-choice" href="/borrow/" data-type="loan">
          <span className="kit-choice-icon" data-identity="loan" aria-hidden="true">
            <KitIcon name="wave" />
          </span>
          <h2>Self-Repaying Loan</h2>
          <p>Access liquidity now. Your pledged stream repays the loan over time.</p>
          <span className="kit-text-button">
            Create a loan
            <KitIcon name="arrow" />
          </span>
        </a>
        <a className="kit-create-choice" href="/supply/" data-type="fixed">
          <span className="kit-choice-icon" data-identity="fixed" aria-hidden="true">
            <KitIcon name="return" />
          </span>
          <h2>Fixed Return</h2>
          <p>Supply an OVRFLO asset at your chosen APR. Unmatched funds remain withdrawable.</p>
          <span className="kit-text-button">
            Create a fixed return
            <KitIcon name="arrow" />
          </span>
        </a>
        <a className="kit-create-choice" href="/create/stream/" data-type="stream">
          <span className="kit-choice-icon" data-identity="stream" aria-hidden="true">
            <KitIcon name="stream" />
          </span>
          <h2>Stream</h2>
          <p>Receive tokens now, with more releasing over time.</p>
          <span className="kit-text-button">
            Create a stream
            <KitIcon name="arrow" />
          </span>
        </a>
      </div>
    </section>
  );
}

export function DefaultHub({
  welcome,
  backHref,
  backLabel,
  returnHref,
}: {
  welcome: string;
  help?: string;
  backHref?: string;
  backLabel?: string;
  returnHref?: string;
}) {
  return (
    <CreateChooser title={welcome} backHref={backHref} backLabel={backLabel} returnHref={returnHref} />
  );
}
