import {
  isAddressEqual,
  type Address,
  type PublicClient,
} from "viem";
import { ovrfloLensAbi } from "@/lib/abis";
import { isConfiguredAddress } from "@/lib/config";
import { callPin, verifyPinHash, type BlockPin, type PinClient, type PinMode } from "./pin";
import {
  protocolReady,
  protocolStamp,
  protocolUnavailable,
  readFailure,
  type ProtocolStamp,
  type ReadFailure,
  type ReadOutcome,
} from "./read-outcome";

/**
 * One `streamsOfOwner` call at or below this ERC-721 balance.
 * Ticket 04: in-process gas ~20k/stream after base; 250 ≈ 5M. Production RPC blocked.
 */
export const COMPLETE_SET_UNBOUNDED_MAX = 250n;

/**
 * `streamsOfOwnerIn` window after a complete-read resource limit.
 * Ticket 04: n=50 measured 1_003_243 gas.
 */
export const COMPLETE_SET_WINDOW = 50n;

export type StreamReadClient = Pick<PublicClient, "readContract"> & {
  getBlock?: PinClient["getBlock"];
};

export type StreamView = {
  streamId: bigint;
  owner: Address;
  sender: Address;
  asset: Address;
  startTime: number;
  cliffTime: number;
  endTime: number;
  deposited: bigint;
  withdrawn: bigint;
  refunded: bigint;
  withdrawableAmount: bigint;
  status: number;
  isCancelable: boolean;
  isDepleted: boolean;
  wasCanceled: boolean;
};

export type StreamPage = {
  streams: readonly StreamView[];
  total: bigint;
};

export type StreamReadOptions = {
  signal?: AbortSignal;
  pinMode?: PinMode;
};

function transportFailure(source: string, error: unknown): ReadFailure {
  return readFailure(source, "transport", error);
}

function invalidFailure(source: string, message: string): ReadFailure {
  return readFailure(source, "invalid", message, { retryable: false });
}

function incompleteFailure(source: string, message: string, entityId?: string): ReadFailure {
  return readFailure(source, "incomplete", message, { retryable: false, entityId });
}

export function isResourceLimitFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /out of gas|response too large|oversized data|max response/i.test(message);
}

function zeroOwnerOutcome(): ReadOutcome<StreamPage> {
  return protocolUnavailable([invalidFailure("lens", "refusing the zero owner")]);
}

function decodeView(row: unknown): StreamView {
  if (Array.isArray(row)) {
    return {
      streamId: row[0] as bigint,
      owner: row[1] as Address,
      sender: row[2] as Address,
      asset: row[3] as Address,
      startTime: Number(row[4]),
      cliffTime: Number(row[5]),
      endTime: Number(row[6]),
      deposited: row[7] as bigint,
      withdrawn: row[8] as bigint,
      refunded: row[9] as bigint,
      withdrawableAmount: row[10] as bigint,
      status: Number(row[11]),
      isCancelable: Boolean(row[12]),
      isDepleted: Boolean(row[13]),
      wasCanceled: Boolean(row[14]),
    };
  }
  return row as StreamView;
}

function decodeBatch(result: unknown): { total: bigint; rows: StreamView[] } {
  if (Array.isArray(result)) {
    const total = result[0] as bigint;
    const rows = (result[1] as readonly unknown[]).map(decodeView);
    return { total, rows };
  }
  const named = result as { total: bigint; streams: readonly unknown[] };
  return { total: named.total, rows: named.streams.map(decodeView) };
}

async function lensRead(
  client: StreamReadClient,
  lens: Address,
  pin: BlockPin,
  functionName: "streamsOfOwner" | "streamsOfOwnerIn",
  args: readonly unknown[],
  options?: StreamReadOptions,
): Promise<{ total: bigint; rows: StreamView[] } | { failure: ReadFailure; resourceLimit: boolean }> {
  try {
    const result = await client.readContract({
      address: lens,
      abi: ovrfloLensAbi,
      functionName,
      args: args as never,
      ...callPin(pin, options?.pinMode ?? "hash"),
      ...(options?.signal ? { requestOptions: { signal: options.signal } } : {}),
    });
    return decodeBatch(result);
  } catch (error) {
    return {
      failure: transportFailure("lens", error),
      resourceLimit: isResourceLimitFailure(error),
    };
  }
}

function finalizePage(
  rows: readonly StreamView[],
  owner: Address,
  stamp: ProtocolStamp,
  total: bigint,
): ReadOutcome<StreamPage> {
  for (const row of rows) {
    if (!isAddressEqual(row.owner, owner)) {
      return protocolUnavailable(
        [
          incompleteFailure(
            "lens",
            `row owner ${row.owner} does not match queried owner ${owner}`,
            row.streamId.toString(),
          ),
        ],
        stamp,
        { streams: [...rows], total },
      );
    }
  }
  return protocolReady({ streams: [...rows], total }, stamp);
}

/**
 * Windowed hydration: `streamsOfOwnerIn(owner, start, stop)` on the deployed lens.
 */
export async function loadStreamPage(
  client: StreamReadClient,
  lens: Address,
  owner: Address,
  start: bigint,
  stop: bigint,
  pin: BlockPin,
  options?: StreamReadOptions,
): Promise<ReadOutcome<StreamPage>> {
  if (!isConfiguredAddress(owner)) {
    return zeroOwnerOutcome();
  }
  const called = await lensRead(client, lens, pin, "streamsOfOwnerIn", [owner, start, stop], options);
  if ("failure" in called) {
    return protocolUnavailable([called.failure]);
  }
  return finalizePage(called.rows, owner, protocolStamp(pin), called.total);
}

async function assertWalkPin(
  client: StreamReadClient,
  pin: BlockPin,
): Promise<ReadFailure | null> {
  if (typeof client.getBlock !== "function") return null;
  const verified = await verifyPinHash({ getBlock: client.getBlock }, pin);
  if (!verified.ok) {
    return readFailure(
      "lens",
      verified.code === "transport" ? "transport" : "invalid",
      verified.message,
    );
  }
  return null;
}

async function loadWindowedStreams(
  client: StreamReadClient,
  lens: Address,
  owner: Address,
  pin: BlockPin,
  options: StreamReadOptions | undefined,
  knownTotal?: bigint,
): Promise<ReadOutcome<StreamPage>> {
  const merged: StreamView[] = [];
  let total = knownTotal ?? 0n;
  let stamp: ProtocolStamp | undefined;
  let start = 0n;
  let resolvedTotal = knownTotal !== undefined;

  while (!resolvedTotal || start < total) {
    const skew = await assertWalkPin(client, pin);
    if (skew) {
      return protocolUnavailable([skew], stamp, { streams: merged, total });
    }
    const stop = start + COMPLETE_SET_WINDOW;
    const page = await loadStreamPage(client, lens, owner, start, stop, pin, options);
    if (page.status === "unavailable") {
      return page;
    }
    if (page.status !== "ready") {
      return protocolUnavailable([
        incompleteFailure("lens", `window [${start.toString()}, ${stop.toString()}) did not resolve`),
      ]);
    }
    total = page.data.total;
    resolvedTotal = true;
    stamp = protocolStamp(
      pin,
      "fetchedAtMs" in page.metadata && typeof page.metadata.fetchedAtMs === "number"
        ? page.metadata.fetchedAtMs
        : Date.now(),
    );
    if (start >= total) {
      break;
    }
    const expected = (stop > total ? total : stop) - start;
    if (BigInt(page.data.streams.length) !== expected) {
      return protocolUnavailable(
        [
          incompleteFailure(
            "lens",
            `window [${start.toString()}, ${stop.toString()}) length ${page.data.streams.length.toString()} !== ${expected.toString()}`,
          ),
        ],
        stamp,
        { streams: [...merged, ...page.data.streams], total },
      );
    }
    merged.push(...page.data.streams);
    start += COMPLETE_SET_WINDOW;
    if (merged.length > 0 && BigInt(merged.length) === total) {
      break;
    }
    if (start >= total) {
      break;
    }
  }

  if (!stamp) {
    return protocolUnavailable([incompleteFailure("lens", "windowed complete-set produced no stamp")]);
  }
  if (BigInt(merged.length) !== total) {
    return protocolUnavailable(
      [
        incompleteFailure(
          "lens",
          `merged length ${merged.length.toString()} !== total ${total.toString()}`,
        ),
      ],
      stamp,
      { streams: merged, total },
    );
  }
  return finalizePage(merged, owner, stamp, total);
}

/**
 * Complete set at one pin. One `streamsOfOwner` call. A resource-limit
 * failure windows once and does not retry `streamsOfOwner`.
 */
export async function loadCompleteStreams(
  client: StreamReadClient,
  lens: Address,
  owner: Address,
  pin: BlockPin,
  options?: StreamReadOptions,
): Promise<ReadOutcome<StreamPage>> {
  if (!isConfiguredAddress(owner)) {
    return zeroOwnerOutcome();
  }

  const called = await lensRead(client, lens, pin, "streamsOfOwner", [owner], options);
  if ("failure" in called) {
    if (called.resourceLimit) {
      return loadWindowedStreams(client, lens, owner, pin, options);
    }
    return protocolUnavailable([called.failure]);
  }

  const stamped = protocolStamp(pin);
  if (BigInt(called.rows.length) !== called.total) {
    return protocolUnavailable(
      [
        incompleteFailure(
          "lens",
          `streamsOfOwner length ${called.rows.length.toString()} !== total ${called.total.toString()}`,
        ),
      ],
      stamped,
      { streams: called.rows, total: called.total },
    );
  }
  return finalizePage(called.rows, owner, stamped, called.total);
}
