import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Address } from "viem";
import { useAllMarkets } from "@/hooks/useAllMarkets";
import type { MarketInfo, VaultInfo } from "@/lib/types";

const VAULT_A = "0x0000000000000000000000000000000000000a01" as Address;
const MARKET_A = "0x0000000000000000000000000000000000000ea1" as Address;
const PT_TOKEN = "0x0000000000000000000000000000000000000701" as Address;
const OVRFLO_TOKEN = "0x0000000000000000000000000000000000000702" as Address;
const UNDERLYING = "0x0000000000000000000000000000000000000703" as Address;
const ORACLE = "0x0000000000000000000000000000000000000704" as Address;

const vault: VaultInfo = {
  vault: VAULT_A,
  treasury: "0x0000000000000000000000000000000000000705" as Address,
  underlying: UNDERLYING,
  ovrfloToken: OVRFLO_TOKEN,
  reserve: "0x0000000000000000000000000000000000000706" as Address,
  lending: null,
  retiredLendings: [],
};

const market: MarketInfo = {
  ...vault,
  market: MARKET_A,
  twapDurationFixed: 900,
  feeBps: 40,
  expiryCached: 1_800_000_000n,
  ptToken: PT_TOKEN,
  oracle: ORACLE,
};

let ovrflosState: {
  status: "ready" | "loading" | "unavailable";
  vaults?: VaultInfo[];
  stream?: Address;
  isLoading: boolean;
  error: unknown;
  tooLarge?: boolean;
  bootstrap?: {
    status: "ready" | "loading" | "unavailable";
    markets?: MarketInfo[];
    failures?: { code: string; message: string }[];
  };
};

vi.mock("@/hooks/useOvrflos", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useOvrflos")>("@/hooks/useOvrflos");
  return { ...actual, useOvrflos: () => ovrflosState };
});

describe("useAllMarkets", () => {
  beforeEach(() => {
    ovrflosState = {
      status: "loading",
      isLoading: true,
      error: null,
      bootstrap: { status: "loading" },
    };
  });

  it("reads markets from factory bootstrap", () => {
    ovrflosState = {
      status: "ready",
      stream: VAULT_A,
      bootstrap: { status: "ready", markets: [market] },
      vaults: [vault],
      isLoading: false,
      error: null,
    };
    const { result } = renderHook(() => useAllMarkets());
    expect(result.current.status).toBe("ready");
    expect(result.current.markets).toEqual([market]);
    expect(result.current.tooLarge).toBe(false);
  });

  it("returns no markets when bootstrap has an empty series", () => {
    ovrflosState = {
      status: "ready",
      stream: VAULT_A,
      bootstrap: { status: "ready", markets: [] },
      vaults: [],
      isLoading: false,
      error: null,
    };
    const { result } = renderHook(() => useAllMarkets());
    expect(result.current.markets).toEqual([]);
    expect(result.current.status).toBe("ready");
  });

  it("propagates loading from the upstream hook", () => {
    ovrflosState = { status: "loading", isLoading: true, error: null, bootstrap: { status: "loading" } };
    const { result } = renderHook(() => useAllMarkets());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.status).toBe("loading");
  });

  it("propagates unavailable and budget failures from bootstrap", () => {
    const error = new Error("factory unreachable");
    ovrflosState = {
      status: "unavailable",
      isLoading: false,
      error,
      tooLarge: true,
      bootstrap: {
        status: "unavailable",
        failures: [{ code: "budget_exceeded", message: "approved market total exceeds registry budget" }],
      },
    };
    const { result } = renderHook(() => useAllMarkets());
    expect(result.current.status).toBe("unavailable");
    expect(result.current.error).toBe(error);
    expect(result.current.tooLarge).toBe(true);
    expect(result.current.markets).toEqual([]);
  });
});
