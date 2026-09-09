import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import type { BlockPin } from "@/lib/protocol/pin";
import {
  COMPLETE_SET_UNBOUNDED_MAX,
  COMPLETE_SET_WINDOW,
  isResourceLimitFailure,
  loadCompleteStreams,
  loadStreamPage,
  type StreamReadClient,
  type StreamView,
} from "@/lib/protocol/streams";
import { ZERO_ADDRESS } from "@/lib/config";

const OWNER = "0x00000000000000000000000000000000000000a1" as Address;
const OTHER = "0x00000000000000000000000000000000000000b2" as Address;
const SENDER = "0x00000000000000000000000000000000000000c3" as Address;
const ASSET = "0x00000000000000000000000000000000000000d4" as Address;
const LENS = "0x0000000000000000000000000000000000000e55" as Address;

const PIN: BlockPin = {
  blockNumber: 1_000n,
  blockHash: `0x${"ab".repeat(32)}`,
};

function view(overrides: Partial<StreamView> & Pick<StreamView, "streamId">): StreamView {
  return {
    owner: OWNER,
    sender: SENDER,
    asset: ASSET,
    startTime: 1,
    cliffTime: 1,
    endTime: 2,
    deposited: 10n,
    withdrawn: 0n,
    refunded: 0n,
    withdrawableAmount: 10n,
    status: 1,
    isCancelable: false,
    isDepleted: false,
    wasCanceled: false,
    ...overrides,
  };
}

type ReadArgs = {
  address?: Address;
  functionName?: string;
  args?: readonly unknown[];
  blockNumber?: bigint;
  blockHash?: Hex;
  requireCanonical?: boolean;
};

function expectHashPin(args: { blockHash?: Hex; requireCanonical?: boolean; blockNumber?: bigint }) {
  expect(args.blockHash).toBe(PIN.blockHash);
  expect(args.requireCanonical).toBe(true);
  expect(args.blockNumber).toBeUndefined();
}

function makeClient(input: {
  total?: bigint;
  page?: (args: { start: bigint; stop: bigint }) => StreamView[];
  complete?: StreamView[];
  completeError?: unknown;
  windowError?: unknown;
}): { client: StreamReadClient; reads: ReadArgs[] } {
  const reads: ReadArgs[] = [];
  const client = {
    async readContract(args: ReadArgs) {
      reads.push(args);
      if (args.functionName === "streamsOfOwner") {
        if (input.completeError) throw input.completeError;
        const rows = input.complete ?? [];
        return [input.total ?? BigInt(rows.length), rows];
      }
      if (args.functionName === "streamsOfOwnerIn") {
        if (input.windowError) throw input.windowError;
        const start = args.args?.[1] as bigint;
        const stop = args.args?.[2] as bigint;
        const rows = input.page?.({ start, stop }) ?? [];
        return [input.total ?? 0n, rows];
      }
      if (args.functionName === "ownerOf") {
        throw new Error(`unexpected ownerOf in lens mock`);
      }
      throw new Error(`unexpected ${args.functionName}`);
    },
  } as unknown as StreamReadClient;
  return { client, reads };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadStreamPage", () => {
  it("returns a ready page stamped with fetchedAtMs, blockNumber, and blockHash", async () => {
    const rows = [view({ streamId: 7n }), view({ streamId: 8n })];
    const { client, reads } = makeClient({
      total: 2n,
      page: () => rows,
    });
    const outcome = await loadStreamPage(client, LENS, OWNER, 0n, 2n, PIN);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") throw new Error("expected ready");
    expect(outcome.data.streams.map((row) => row.streamId)).toEqual([7n, 8n]);
    expect(outcome.data.total).toBe(2n);
    expect(outcome.metadata.blockNumber).toBe(PIN.blockNumber);
    expect(outcome.metadata.blockHash).toBe(PIN.blockHash);
    expect("fetchedAtMs" in outcome.metadata).toBe(true);
    expect(typeof (outcome.metadata as { fetchedAtMs: number }).fetchedAtMs).toBe("number");
    expect(reads).toHaveLength(1);
    expect(reads[0]?.address).toBe(LENS);
    expect(reads[0]?.functionName).toBe("streamsOfOwnerIn");
    expect(reads[0]?.args).toEqual([OWNER, 0n, 2n]);
    expectHashPin(reads[0]!);
    expect(
      JSON.stringify(reads[0], (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
    ).not.toMatch(/stateOverride/);
  });

  it("does not query the zero owner", async () => {
    const { client, reads } = makeClient({});
    const outcome = await loadStreamPage(client, LENS, ZERO_ADDRESS, 0n, 1n, PIN);
    expect(outcome.status).toBe("unavailable");
    if (outcome.status !== "unavailable") throw new Error("expected unavailable");
    expect(outcome.failures[0]?.code).toBe("invalid");
    expect(reads).toHaveLength(0);
  });

  it("marks the whole page unavailable when a row has the wrong owner", async () => {
    const rows = [view({ streamId: 1n }), view({ streamId: 2n, owner: OTHER })];
    const { client } = makeClient({ total: 2n, page: () => rows });
    const outcome = await loadStreamPage(client, LENS, OWNER, 0n, 2n, PIN);
    expect(outcome.status).toBe("unavailable");
    if (outcome.status !== "unavailable") throw new Error("expected unavailable");
    expect(outcome.failures[0]?.code).toBe("incomplete");
  });

  it("treats OOG and other call failures as unavailable, not an empty success", async () => {
    const { client } = makeClient({ windowError: new Error("out of gas") });
    const outcome = await loadStreamPage(client, LENS, OWNER, 0n, 25n, PIN);
    expect(outcome.status).toBe("unavailable");
    if (outcome.status !== "unavailable") throw new Error("expected unavailable");
    expect(outcome.failures[0]?.code).toBe("transport");
    expect(outcome.failures[0]?.message).toMatch(/out of gas/i);
    expect(outcome.data).toBeUndefined();
  });

  it("treats a reorged or missing hash pin as unavailable", async () => {
    const { client } = makeClient({ windowError: new Error("block not found") });
    const outcome = await loadStreamPage(client, LENS, OWNER, 0n, 1n, PIN);
    expect(outcome.status).toBe("unavailable");
    if (outcome.status !== "unavailable") throw new Error("expected unavailable");
    expect(outcome.failures[0]?.code).toBe("transport");
    expect(outcome.failures[0]?.message).toMatch(/block not found/i);
  });

  it("allows wasCanceled and isDepleted together", async () => {
    const rows = [view({ streamId: 9n, wasCanceled: true, isDepleted: true, status: 4 })];
    const { client } = makeClient({ total: 1n, page: () => rows });
    const outcome = await loadStreamPage(client, LENS, OWNER, 0n, 1n, PIN);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") throw new Error("expected ready");
    expect(outcome.data.streams[0]?.wasCanceled).toBe(true);
    expect(outcome.data.streams[0]?.isDepleted).toBe(true);
  });
});

describe("loadCompleteStreams", () => {
  it("uses one streamsOfOwner call when the complete read succeeds", async () => {
    const rows = Array.from({ length: Number(COMPLETE_SET_UNBOUNDED_MAX) }, (_, index) =>
      view({ streamId: BigInt(index + 1) }),
    );
    const { client, reads } = makeClient({
      total: COMPLETE_SET_UNBOUNDED_MAX,
      complete: rows,
    });
    const outcome = await loadCompleteStreams(client, LENS, OWNER, PIN);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") throw new Error("expected ready");
    expect(outcome.data.streams).toHaveLength(Number(COMPLETE_SET_UNBOUNDED_MAX));
    expect(reads).toHaveLength(1);
    expect(reads[0]?.functionName).toBe("streamsOfOwner");
    expect(reads[0]?.address).toBe(LENS);
    expectHashPin(reads[0]!);
  });

  it("windows once after a complete-read resource limit and does not retry streamsOfOwner", async () => {
    const total = COMPLETE_SET_UNBOUNDED_MAX + 1n;
    const { client, reads } = makeClient({
      total,
      completeError: new Error("out of gas"),
      page: ({ start, stop }) => {
        const rows: StreamView[] = [];
        const end = stop > total ? total : stop;
        for (let id = start; id < end; id++) {
          rows.push(view({ streamId: id + 1n }));
        }
        return rows;
      },
    });
    const outcome = await loadCompleteStreams(client, LENS, OWNER, PIN);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") throw new Error("expected ready");
    expect(outcome.data.streams).toHaveLength(Number(total));
    const names = reads.map((read) => read.functionName);
    expect(names.filter((name) => name === "streamsOfOwner")).toHaveLength(1);
    expect(names.slice(1).every((name) => name === "streamsOfOwnerIn")).toBe(true);
    expect(COMPLETE_SET_WINDOW).toBe(50n);
    expect(reads[1]?.args?.[1]).toBe(0n);
    expect(reads[1]?.args?.[2]).toBe(50n);
  });

  it("does not convert an integrity failure into a successful empty result", async () => {
    const { client } = makeClient({
      total: 2n,
      complete: [view({ streamId: 1n })],
    });
    const outcome = await loadCompleteStreams(client, LENS, OWNER, PIN);
    expect(outcome.status).toBe("unavailable");
    if (outcome.status !== "unavailable") throw new Error("expected unavailable");
    expect(outcome.failures[0]?.code).toBe("incomplete");
    expect(outcome.failures[0]?.message).toMatch(/length 1 !== total 2/);
    expect(outcome.data?.streams).toHaveLength(1);
  });

  it("does not window after a non-resource complete-read failure", async () => {
    const { client, reads } = makeClient({
      completeError: new Error("execution reverted"),
    });
    const outcome = await loadCompleteStreams(client, LENS, OWNER, PIN);
    expect(outcome.status).toBe("unavailable");
    expect(reads).toHaveLength(1);
    expect(reads[0]?.functionName).toBe("streamsOfOwner");
  });

  it("returns ready empty when the lens reports total zero", async () => {
    const { client, reads } = makeClient({ total: 0n, complete: [] });
    const outcome = await loadCompleteStreams(client, LENS, OWNER, PIN);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") throw new Error("expected ready");
    expect(outcome.data.streams).toEqual([]);
    expect(outcome.data.total).toBe(0n);
    expect(reads).toHaveLength(1);
    expect(reads[0]?.functionName).toBe("streamsOfOwner");
  });

  it("does not query the zero owner", async () => {
    const { client, reads } = makeClient({});
    const outcome = await loadCompleteStreams(client, LENS, ZERO_ADDRESS, PIN);
    expect(outcome.status).toBe("unavailable");
    expect(reads).toHaveLength(0);
  });
});

describe("isResourceLimitFailure", () => {
  it("matches oversized complete-read failures", () => {
    expect(isResourceLimitFailure(new Error("out of gas"))).toBe(true);
    expect(isResourceLimitFailure(new Error("response too large"))).toBe(true);
    expect(isResourceLimitFailure(new Error("execution reverted"))).toBe(false);
  });
});

