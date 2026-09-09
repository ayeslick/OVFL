import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, useEffect, useState, type ReactNode } from "react";
import type { Address, Hash } from "viem";
import { useStreams } from "@/hooks/useStreams";
import { MIN_STREAM_AMOUNT } from "@/lib/lending-math";
import { readyOutcome, unavailableOutcome, readFailure } from "@/lib/read-outcome";
import type { StreamView } from "@/lib/protocol/streams";
import { chainId } from "@/lib/config";
import { streamBookKeys } from "@/lib/query-keys";

const ACCOUNT = "0x00000000000000000000000000000000000000a1" as Address;
const VAULT = "0x00000000000000000000000000000000000000b2" as Address;
const TOKEN = "0x00000000000000000000000000000000000000c3" as Address;
const MARKET = "0x00000000000000000000000000000000000000e5" as Address;

const { LOCKUP, loadCompleteStreams, pinCtl } = vi.hoisted(() => {
  const HASH_A = `0x${"aa".repeat(32)}` as Hash;
  const HASH_B = `0x${"bb".repeat(32)}` as Hash;
  let current = { blockNumber: 10n, blockHash: HASH_A };
  const listeners = new Set<() => void>();
  return {
    LOCKUP: "0x0000000000000000000000000000000000000f66" as Address,
    loadCompleteStreams: vi.fn(),
    pinCtl: {
      HASH_A,
      HASH_B,
      get: () => current,
      set(next: { blockNumber: bigint; blockHash: Hash }) {
        current = next;
        for (const listener of listeners) listener();
      },
      reset() {
        current = { blockNumber: 10n, blockHash: HASH_A };
      },
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      advancePin: vi.fn(async () => {
        current = { blockNumber: 11n, blockHash: HASH_B };
        for (const listener of listeners) listener();
      }),
    },
  };
});

vi.mock("@/hooks/useProtocolBootstrap", () => ({
  useProtocolBootstrap: () => ({
    status: "ready" as const,
    factory: "0x0000000000000000000000000000000000000f00" as Address,
    stream: LOCKUP,
    lens: "0x0000000000000000000000000000000000000e55" as Address,
    vaults: [],
    markets: [],
    books: [],
    blockNumber: 1n,
  }),
}));

vi.mock("@/hooks/useEnumerationPin", () => ({
  useEnumerationPin: () => {
    const [pin, setPin] = useState(pinCtl.get());
    useEffect(() => pinCtl.subscribe(() => setPin(pinCtl.get())), []);
    return {
      pin,
      mode: "hash" as const,
      blockTimestamp: 1n,
      headUpdatedAt: 1_000,
      stale: false,
      advancePin: pinCtl.advancePin,
      markFresh: vi.fn(),
    };
  },
}));

vi.mock("wagmi", () => ({
  usePublicClient: () => ({ readContract: vi.fn(), getBlock: vi.fn() }),
}));

vi.mock("@/lib/protocol/streams", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protocol/streams")>();
  return { ...actual, loadCompleteStreams };
});

function view(streamId: bigint, overrides: Partial<StreamView> = {}): StreamView {
  return {
    streamId,
    owner: ACCOUNT,
    sender: VAULT,
    asset: TOKEN,
    startTime: 1_000,
    cliffTime: 1_000,
    endTime: 2_000,
    deposited: MIN_STREAM_AMOUNT * 2n,
    withdrawn: 0n,
    refunded: 0n,
    withdrawableAmount: 1n,
    status: 1,
    isCancelable: false,
    isDepleted: false,
    wasCanceled: false,
    ...overrides,
  };
}

const input = {
  account: ACCOUNT,
  vaults: [{ vault: VAULT, ovrfloToken: TOKEN }],
  markets: [{ vault: VAULT, market: MARKET, ovrfloToken: TOKEN, expiryCached: 2_000n }],
  registryComplete: true,
  now: 1_500n,
  stream: LOCKUP,
};

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

describe("useStreams complete lens read", () => {
  beforeEach(() => {
    loadCompleteStreams.mockReset();
    pinCtl.reset();
    pinCtl.advancePin.mockReset();
    pinCtl.advancePin.mockImplementation(async () => {
      pinCtl.set({ blockNumber: 11n, blockHash: pinCtl.HASH_B });
    });
    loadCompleteStreams.mockResolvedValue(
      readyOutcome({ streams: [view(5n)], total: 1n }),
    );
  });

  it("hydrates from one loadCompleteStreams call and keeps ids as bigint", async () => {
    const queryClient = client();
    const { result } = renderHook(() => useStreams(input), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(loadCompleteStreams).toHaveBeenCalledTimes(1);
    if (result.current.status !== "ready") throw new Error("expected ready");
    expect(result.current.data.streams[0]?.streamId).toBe(5n);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("does not query when the account is unset", async () => {
    const queryClient = client();
    const { result } = renderHook(
      () => useStreams({ ...input, account: undefined }),
      { wrapper: wrapper(queryClient) },
    );
    expect(result.current.status).toBe("loading");
    expect(loadCompleteStreams).not.toHaveBeenCalled();
  });

  it("does not query the zero owner", async () => {
    const queryClient = client();
    const { result } = renderHook(
      () =>
        useStreams({
          ...input,
          account: "0x0000000000000000000000000000000000000000" as Address,
        }),
      { wrapper: wrapper(queryClient) },
    );
    expect(result.current.status).toBe("loading");
    expect(loadCompleteStreams).not.toHaveBeenCalled();
  });

  it("fails closed on duplicate ids in one atomic result", async () => {
    loadCompleteStreams.mockResolvedValue(
      readyOutcome({ streams: [view(5n), view(5n)], total: 2n }),
    );
    const queryClient = client();
    const { result } = renderHook(() => useStreams(input), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    if (result.current.status !== "unavailable") throw new Error("expected unavailable");
    expect(result.current.failures[0]?.message).toMatch(/duplicate/i);
  });

  it("does not convert a transport failure into an empty success", async () => {
    loadCompleteStreams.mockResolvedValue(
      unavailableOutcome([readFailure("loadCompleteStreams", "transport", "rpc down")]),
    );
    const queryClient = client();
    const { result } = renderHook(() => useStreams(input), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.data).toBeUndefined();
  });

  it("advances the pin when the complete read hits an unknown block", async () => {
    loadCompleteStreams.mockResolvedValue(
      unavailableOutcome([readFailure("loadCompleteStreams", "transport", "unknown block")]),
    );
    const queryClient = client();
    renderHook(() => useStreams(input), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(pinCtl.advancePin).toHaveBeenCalled());
  });

  it("keys the complete-set query by pin hash", () => {
    expect(streamBookKeys.complete(chainId, LOCKUP, ACCOUNT, pinCtl.HASH_A)[0]).toBe(
      streamBookKeys.all[0],
    );
  });
});
