import "./watch-app-mocks";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WatchApp } from "@/components/watch/WatchApp";
import { Wall, visibleLensTabs } from "@/components/watch/Wall";
import { writeWatchSearch } from "@/lib/watch-url";
import { entryBook } from "@/lib/watch-entry";
import { resetDisclosure, setDisclosure } from "@/lib/disclosure";
import {
  activeLoan,
  eligibleStream,
  filledPosition,
  LENDING,
  loanStreamTruth,
  mockCanvas,
  restingPosition,
  stubViewport,
} from "./fixtures";
import { fx, resetWatchFx } from "./watch-fx";

describe("inventory — entry, lenses, watch index, first-run, degraded, narrow nav", () => {
  beforeEach(() => {
    resetWatchFx();
    stubViewport(1280);
    mockCanvas();
  });

  afterEach(() => {
    resetWatchFx();
    resetDisclosure();
  });

  it("1 ENTRY.DISCONNECTED — three-type start, CONNECT WALLET, no TVL, no empty-book lie", () => {
    render(<WatchApp />);
    expect(screen.getByRole("heading", { name: "OVRFLO" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONNECT WALLET" })).toBeInTheDocument();
    expect(screen.queryByText("EVENTS UNAVAILABLE")).not.toBeInTheDocument();
    expect(screen.queryByText("USD UNAVAILABLE")).not.toBeInTheDocument();
    expect(screen.queryByText("STALE — SIGNING DISABLED")).not.toBeInTheDocument();
    const nav = document.querySelector('[data-ui="UI-SHELL-NAV"]');
    expect(nav?.textContent).toContain("Your OVRFLO");
    expect(nav?.textContent).toContain("New position");
    expect(nav?.textContent).not.toContain("Activity");
    expect(document.querySelector("[data-ui='UI-WATCH-EMPTY']")).toHaveAttribute("data-state", "start");
    expect(screen.getByRole("link", { name: /Self-Repaying Loan/i })).toHaveAttribute("href", "/borrow/");
    expect(screen.getByRole("link", { name: /Fixed Return/i })).toHaveAttribute("href", "/supply/");
    expect(screen.getByRole("link", { name: /Create a stream/i })).toHaveAttribute("href", "/create/stream/");
    expect(document.querySelector("[data-ui='UI-WATCH-ENTRY-DISCONNECTED']")).toBeNull();
    expect(screen.queryByText(/TVL/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you have no positions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/health factor/i)).not.toBeInTheDocument();
  });

  it("2 ENTRY.READY — connected book lands on supply detail, not first-run", async () => {
    fx.connected = true;
    fx.positions = [filledPosition()];
    render(<WatchApp />);
    await waitFor(() => {
      expect(window.location.search).toMatch(/position=26/);
    });
    expect(screen.getByRole("article")).toHaveAttribute("data-region", "supplied-detail");
    expect(screen.queryByRole("tab", { name: "SUPPLIED" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-control='UI-FIRST-RUN-SURFACE']")).toBeNull();
  });

  it("D empty Your OVRFLO — confirmed-empty books only; no demonstration loan", () => {
    fx.connected = true;
    render(<WatchApp />);
    expect(document.querySelector("[data-ui='UI-WATCH-EMPTY']")).toHaveAttribute("data-state", "ready");
    expect(document.querySelector("[data-control='UI-FIRST-RUN-SURFACE']")).toBeNull();
    expect(screen.queryByRole("tab", { name: "SUPPLIED" })).not.toBeInTheDocument();
    expect(screen.queryByText(/demonstration/i)).not.toBeInTheDocument();
    expect(document.querySelector("[data-ui='UI-WATCH-EMPTY-CREATE']")).toHaveAttribute("href", "/create/");
  });

  it("C degraded status + streams discovery could-not-ask is incomplete, never first-run", () => {
    fx.connected = true;
    fx.streamStatus = "unavailable";
    fx.freshnessKind = "degraded";
    fx.signingAllowed = false;
    render(<WatchApp />);
    expect(document.querySelector("[data-control='UI-FIRST-RUN-SURFACE']")).toBeNull();
    expect(screen.getByText(/STREAM DISCOVERY IS UNAVAILABLE/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "STREAMS" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go to Advanced" })).not.toBeInTheDocument();
    expect(document.querySelector(".kit-status")).toBeNull();
    expect(screen.queryByText("STALE — SIGNING DISABLED")).not.toBeInTheDocument();
    act(() => {
      setDisclosure("advanced");
    });
    expect(screen.getByRole("tab", { name: "STREAMS" })).toBeInTheDocument();
    const shellStatus = document.querySelector(".kit-status");
    expect(shellStatus).toHaveAttribute("data-state", "degraded");
    expect(shellStatus).toHaveTextContent(/DEGRADED — SHOWING LAST KNOWN/);
    expect(screen.getByText("STALE — SIGNING DISABLED")).toBeInTheDocument();
  });

  it("A three lens renders — SUPPLIED / BORROWED / STREAMS labels; zero-count hidden", () => {
    const tabs = visibleLensTabs({
      positions: entryBook("ready", 1),
      loans: entryBook("ready", 1),
      streams: entryBook("ready", 1),
    });
    expect(tabs.map((tab) => tab.label)).toEqual(["SUPPLIED", "BORROWED", "STREAMS"]);
    const hidden = visibleLensTabs({
      positions: entryBook("ready", 1),
      loans: entryBook("ready", 0),
      streams: entryBook("ready", 0),
    });
    expect(hidden.find((tab) => tab.id === "borrowed")?.visible).toBe(false);
    expect(hidden.find((tab) => tab.id === "streams")?.visible).toBe(false);

    render(
      <Wall
        tabs={tabs}
        lens="supplied"
        onSelectLens={() => undefined}
        positions={[filledPosition()]}
        loans={[activeLoan()]}
        streams={[eligibleStream()]}
        pledgedByStream={new Map()}
        loanStreams={new Map()}
        nowSeconds={1_800_000_000n}
        nowMs={1_800_000_000_000}
        lastReadAt={1_800_000_000n}
        selection={{ kind: "none" }}
        onSelect={() => undefined}
        streamsDegraded={null}
      />,
    );
    expect(screen.getByRole("tab", { name: "SUPPLIED" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /SUPPLY #26/ })).toBeInTheDocument();
    expect(screen.getByText(/FILLED/)).toBeInTheDocument();
  });

  it("A borrowed and streams lenses show role rows and hide CLAIM ALL", () => {
    const tabs = visibleLensTabs({
      positions: entryBook("ready", 1),
      loans: entryBook("ready", 1),
      streams: entryBook("ready", 1),
    });
    const { rerender } = render(
      <Wall
        tabs={tabs}
        lens="borrowed"
        onSelectLens={() => undefined}
        positions={[filledPosition()]}
        loans={[activeLoan()]}
        streams={[eligibleStream()]}
        pledgedByStream={new Map()}
        loanStreams={new Map()}
        nowSeconds={1_800_000_000n}
        nowMs={1_800_000_000_000}
        lastReadAt={1_800_000_000n}
        selection={{ kind: "none" }}
        onSelect={() => undefined}
        streamsDegraded={null}
      />,
    );
    expect(screen.getByRole("button", { name: /LOAN #12/ })).toBeInTheDocument();
    expect(screen.queryByText(/CLAIM ALL/i)).not.toBeInTheDocument();

    rerender(
      <Wall
        tabs={tabs}
        lens="streams"
        onSelectLens={() => undefined}
        positions={[filledPosition()]}
        loans={[activeLoan()]}
        streams={[eligibleStream()]}
        pledgedByStream={new Map()}
        loanStreams={new Map()}
        nowSeconds={1_800_000_000n}
        nowMs={1_800_000_000_000}
        lastReadAt={1_800_000_000n}
        selection={{ kind: "none" }}
        onSelect={() => undefined}
        streamsDegraded={null}
      />,
    );
    expect(screen.getByRole("button", { name: /STREAM #441/ })).toBeInTheDocument();
  });

  it("15 POSITIONS.INDEX + SUPPLY_DETAIL — CLAIM visible when claimable, WITHDRAW when unfilled", () => {
    fx.connected = true;
    fx.positions = [filledPosition()];
    writeWatchSearch({ lens: "supplied", selection: { kind: "position", lending: LENDING, id: 26n } }, "replace");
    render(<WatchApp />);
    expect(screen.getByRole("article")).toHaveAttribute("data-region", "supplied-detail");
    expect(screen.getByText("YOUR EARNINGS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CLAIM / })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WITHDRAW UNFILLED" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CLAIM ALL/i })).not.toBeInTheDocument();
  });

  it("15 resting supplied detail removes CLAIM and names inert match state", () => {
    fx.connected = true;
    fx.positions = [restingPosition()];
    writeWatchSearch({ lens: "supplied", selection: { kind: "position", lending: LENDING, id: 41n } }, "replace");
    render(<WatchApp />);
    expect(screen.getByRole("article")).toHaveAttribute("data-state", "resting");
    expect(screen.queryByRole("button", { name: /CLAIM / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WITHDRAW UNFILLED" })).toBeInTheDocument();
    expect(screen.queryByText("YOUR EARNINGS")).not.toBeInTheDocument();
  });

  it("16 POSITIONS.INDEX + LOAN_DETAIL — REPAY visible; CLOSE absent until covered; done date present", () => {
    fx.connected = true;
    fx.loans = [activeLoan()];
    fx.loanStreams = new Map([["440", loanStreamTruth(440n)]]);
    writeWatchSearch({ lens: "borrowed", selection: { kind: "loan", lending: LENDING, id: 12n } }, "replace");
    render(<WatchApp />);
    expect(screen.getByRole("article")).toHaveAttribute("data-region", "borrowed-detail");
    expect(screen.getByRole("button", { name: "REPAY" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CLOSE FROM STREAM" })).not.toBeInTheDocument();
    expect(screen.getByText("Done date")).toBeInTheDocument();
    expect(screen.queryByText(/health factor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/liquidat/i)).not.toBeInTheDocument();
  });

  it("16 loan detail shows CHECKING… for DONE DATE until the schedule hydrates", () => {
    fx.connected = true;
    fx.loans = [activeLoan()];
    fx.loanStreams = new Map();
    writeWatchSearch({ lens: "borrowed", selection: { kind: "loan", lending: LENDING, id: 12n } }, "replace");
    render(<WatchApp />);
    expect(screen.getByText("Done date")).toBeInTheDocument();
    expect(screen.getByText("Checking…")).toBeInTheDocument();
  });

  it("17 POSITIONS.INDEX + STREAM_DETAIL — BORROW AGAINST THIS STREAM when eligible", () => {
    fx.connected = true;
    fx.streams = [eligibleStream()];
    writeWatchSearch({ lens: "streams", selection: { kind: "stream", id: 441n } }, "replace");
    render(<WatchApp />);
    expect(screen.getByRole("article", { name: /^Stream 441 Streaming$/ })).toHaveAttribute(
      "data-region",
      "stream-detail",
    );
    expect(screen.getByRole("button", { name: "BORROW AGAINST THIS STREAM" })).toBeInTheDocument();
  });

  it("H narrow-viewport watch navigation — Back to supplied at 360px, in-place at 1280px", async () => {
    fx.connected = true;
    fx.positions = [filledPosition(), restingPosition()];
    const wide = render(<WatchApp />);
    await waitFor(() => {
      expect(window.location.search).toMatch(/type=fixed/);
    });
    fireEvent.click(screen.getByRole("button", { name: /SUPPLY #26/ }));
    expect(window.location.search).toMatch(/position=26/);
    expect(screen.getByRole("article")).toHaveAttribute("data-region", "supplied-detail");
    expect(screen.queryByRole("button", { name: "Back to supplied" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your returns" })).toHaveAttribute("href", "/?type=fixed");
    wide.unmount();

    stubViewport(360);
    writeWatchSearch({ selection: { kind: "position", lending: LENDING, id: 26n } }, "replace");
    render(<WatchApp />);
    expect(screen.getByRole("link", { name: "Your returns" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Your returns" }));
    expect(window.location.search).not.toMatch(/position=/);
    expect(window.location.search).not.toMatch(/lens=/);
  });
});
