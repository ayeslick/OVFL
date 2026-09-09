import { type Transport, type TransportConfig } from "viem";

export type RpcFailureKind =
  | "forbidden"
  | "rate_limited"
  | "quota_exhausted"
  | "revoked_credential"
  | "execution_reverted"
  | "unknown_block"
  | "transport_unavailable"
  | "unknown";

export const READ_TIMEOUT_MS = 30_000;

export type RpcFailureShape = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  cause?: unknown;
  details?: unknown;
  shortMessage?: unknown;
};

export function classifyRpcFailure(error: unknown): RpcFailureKind {
  if (typeof error === "string") return classifyRpcFailure({ message: error });
  const shapes = errorChain(error);
  const status = shapes
    .map((shape) => shape.status ?? shape.statusCode)
    .find((value): value is number => typeof value === "number");
  const code = shapes
    .map((shape) => shape.code)
    .find((value): value is number => typeof value === "number");
  const message = shapes
    .flatMap((shape) => [shape.message, shape.details, shape.shortMessage])
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (status === 403 || /\b403\b|forbidden/.test(message)) return "forbidden";
  if (status === 429 || /\b429\b|rate.?limit/.test(message)) return "rate_limited";
  if (/quota|compute.?unit|capacity exhausted/.test(message)) return "quota_exhausted";
  if (/revoked|invalid api key|api key.*disabled|credential.*invalid/.test(message)) {
    return "revoked_credential";
  }
  if (
    code === 3 ||
    /execution reverted|contractfunctionreverted|call reverted|revert reason/.test(message)
  ) {
    return "execution_reverted";
  }
  if (
    /unknown block|block not found|header not found|could not find block|unknown block hash|blockhash.*(not found|unknown)|not in the canonical chain|requirecanonical/.test(
      message,
    )
  ) {
    return "unknown_block";
  }
  if (
    /network|fetch failed|timeout|timed out|connection|socket|unavailable|gateway/.test(message)
  ) {
    return "transport_unavailable";
  }
  return "unknown";
}

function errorChain(error: unknown): RpcFailureShape[] {
  const found: RpcFailureShape[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const shape = current as RpcFailureShape;
    found.push(shape);
    current = shape.cause;
  }
  return found;
}

function shouldFailClosed(error: unknown): boolean {
  const kind = classifyRpcFailure(error);
  return kind === "execution_reverted" || kind === "unknown_block";
}

/**
 * Ordinary-read transport chain. A revert or unknown-block pin miss stays on
 * the provider that returned it. Transport failures move to the next URL.
 */
export function createOrderedReadTransport<const T extends readonly Transport[]>(
  transports: T,
): Transport {
  if (transports.length === 0) {
    throw new Error("At least one ordinary-read RPC transport is required");
  }
  return ({ chain, pollingInterval, timeout, retryCount: _retryCount, ...rest }) => {
    const instances = transports.map((transport) =>
      transport({
        chain,
        pollingInterval,
        timeout: timeout ?? READ_TIMEOUT_MS,
        retryCount: 0,
        ...rest,
      }),
    );
    const config = {
      key: "ovrflo-ordered",
      name: "OVRFLO ordered read",
      request: async () => undefined as never,
      retryCount: 0,
      timeout: timeout ?? READ_TIMEOUT_MS,
      type: "ovrflo-ordered-fallback",
    } satisfies TransportConfig;
    return {
      config,
      async request(args, options) {
        let lastError: unknown;
        for (const instance of instances) {
          try {
            return await instance.request(args, options);
          } catch (error) {
            if (shouldFailClosed(error)) throw error;
            lastError = error;
          }
        }
        throw lastError;
      },
    };
  };
}
