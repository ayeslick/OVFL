import { type Address, type PublicClient } from "viem";
import { ovrfloAbi, ovrfloFactoryAbi, ovrfloLendingAbi, ovrfloLensAbi } from "./abis";
import { isConfiguredAddress, ZERO_ADDRESS } from "./config";
import { MAX_VAULT_REGISTRY_ENTRIES } from "./discovery/limits";
import type { MarketInfo, VaultInfo } from "./types";

export type BootstrapFailureCode =
  | "no_code"
  | "wrong_chain"
  | "rpc_revert"
  | "budget_exceeded"
  | "block_skew";

export type BootstrapFailure = {
  code: BootstrapFailureCode;
  message: string;
};

export type LendingBookRecord = {
  lending: Address;
  /** Current `lending.router()`. Null when the book is unset. */
  currentBook: Address | null;
  priorBooks: readonly Address[];
};

export type ProtocolBootstrap =
  | { status: "loading" }
  | {
      status: "ready";
      factory: Address;
      stream: Address;
      lens: Address;
      vaults: readonly VaultInfo[];
      markets: readonly MarketInfo[];
      books: readonly LendingBookRecord[];
      blockNumber: bigint;
    }
  | { status: "unavailable"; failures: readonly BootstrapFailure[] };

export type ReadyProtocolBootstrap = Extract<ProtocolBootstrap, { status: "ready" }>;

export type BootstrapClient = Pick<
  PublicClient,
  "getBytecode" | "getChainId" | "getBlock" | "multicall" | "readContract"
>;

function failure(code: BootstrapFailureCode, message: string): BootstrapFailure {
  return { code, message };
}

function unavailable(...failures: BootstrapFailure[]): Extract<ProtocolBootstrap, { status: "unavailable" }> {
  return { status: "unavailable", failures };
}

function isZero(address: Address | null | undefined): boolean {
  return !address || address.toLowerCase() === ZERO_ADDRESS;
}

/**
 * Factory-rooted protocol discovery. Boot checks run before contract calls.
 * Binding is ×3 (info, lending, reserve). Retired markets come from lendings(i).
 * Passes pin to one block B; any item revert or mismatch fails closed.
 */
export async function discoverProtocolBootstrap(
  client: BootstrapClient,
  factory: Address,
  expectedChainId: number,
  lens: Address,
): Promise<Exclude<ProtocolBootstrap, { status: "loading" }>> {
  let bytecode: Hexish;
  let rpcChainId: number;
  try {
    [bytecode, rpcChainId] = await Promise.all([
      client.getBytecode({ address: factory }),
      client.getChainId(),
    ]);
  } catch (error) {
    return unavailable(
      failure("rpc_revert", error instanceof Error ? error.message : "Boot RPC failed"),
    );
  }

  if (!bytecode || bytecode === "0x") {
    return unavailable(failure("no_code", "Factory has no bytecode at the configured address"));
  }
  if (rpcChainId !== expectedChainId) {
    return unavailable(
      failure(
        "wrong_chain",
        `RPC chain id ${rpcChainId} does not match configured chain id ${expectedChainId}`,
      ),
    );
  }

  let blockNumber: bigint;
  let blockHash: `0x${string}` | null;
  try {
    const block = await client.getBlock({ blockTag: "latest" });
    if (!block.hash) {
      return unavailable(failure("block_skew", "Latest block has no hash"));
    }
    blockNumber = block.number;
    blockHash = block.hash;
  } catch (error) {
    return unavailable(
      failure("rpc_revert", error instanceof Error ? error.message : "getBlock failed"),
    );
  }

  let pass1: readonly MulticallItem[];
  try {
    pass1 = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: [
        {
          address: factory,
          abi: ovrfloFactoryAbi,
          functionName: "ovrfloStream",
        },
        {
          address: factory,
          abi: ovrfloFactoryAbi,
          functionName: "ovrfloCount",
        },
      ],
    });
  } catch (error) {
    return unavailable(
      failure("rpc_revert", error instanceof Error ? error.message : "Pass-1 multicall failed"),
    );
  }

  const streamResult = pass1[0];
  const countResult = pass1[1];
  if (!streamResult || streamResult.status !== "success") {
    return unavailable(failure("rpc_revert", "ovrfloStream() reverted or failed"));
  }
  if (!countResult || countResult.status !== "success") {
    return unavailable(failure("rpc_revert", "ovrfloCount() reverted or failed"));
  }

  const stream = streamResult.result as Address;
  if (isZero(stream)) {
    return unavailable(failure("rpc_revert", "ovrfloStream() is unset"));
  }

  const count = countResult.result as bigint;
  if (count > BigInt(MAX_VAULT_REGISTRY_ENTRIES)) {
    return unavailable(
      failure(
        "budget_exceeded",
        `ovrfloCount ${count.toString()} exceeds registry budget ${MAX_VAULT_REGISTRY_ENTRIES}`,
      ),
    );
  }

  const lensCheck = await verifyDeployedLens(client, lens, stream, blockNumber);
  if (lensCheck.status === "unavailable") return lensCheck;

  const n = Number(count);
  if (n === 0) {
    const skew = await assertBlockStable(client, blockNumber, blockHash);
    if (skew) return skew;
    return {
      status: "ready",
      factory,
      stream,
      lens,
      vaults: [],
      markets: [],
      books: [],
      blockNumber,
    };
  }

  let vaultAddressResults: readonly MulticallItem[];
  try {
    vaultAddressResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: Array.from({ length: n }, (_, index) => ({
        address: factory,
        abi: ovrfloFactoryAbi,
        functionName: "ovrflos" as const,
        args: [BigInt(index)] as const,
      })),
    });
  } catch (error) {
    return unavailable(
      failure("rpc_revert", error instanceof Error ? error.message : "ovrflos multicall failed"),
    );
  }

  if (vaultAddressResults.length !== n) {
    return unavailable(failure("rpc_revert", "ovrflos multicall length mismatch"));
  }

  const vaultAddresses: Address[] = [];
  for (let index = 0; index < n; index++) {
    const item = vaultAddressResults[index];
    if (!item || item.status !== "success") {
      return unavailable(failure("rpc_revert", `ovrflos(${index}) reverted or failed`));
    }
    const vault = item.result as Address;
    if (isZero(vault)) {
      return unavailable(failure("rpc_revert", `ovrflos(${index}) returned the zero address`));
    }
    vaultAddresses.push(vault);
  }

  let bindingResults: readonly MulticallItem[];
  try {
    bindingResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: vaultAddresses.flatMap((vault) => [
        {
          address: factory,
          abi: ovrfloFactoryAbi,
          functionName: "ovrfloInfo" as const,
          args: [vault] as const,
        },
        {
          address: factory,
          abi: ovrfloFactoryAbi,
          functionName: "ovrfloToLending" as const,
          args: [vault] as const,
        },
        {
          address: factory,
          abi: ovrfloFactoryAbi,
          functionName: "ovrfloToReserve" as const,
          args: [vault] as const,
        },
      ]),
    });
  } catch (error) {
    return unavailable(
      failure(
        "rpc_revert",
        error instanceof Error ? error.message : "Vault binding multicall failed",
      ),
    );
  }

  if (bindingResults.length !== vaultAddresses.length * 3) {
    return unavailable(failure("rpc_revert", "Vault binding multicall length mismatch"));
  }

  const vaults: VaultInfo[] = [];
  const vaultByAddress = new Map<string, { index: number }>();
  for (let index = 0; index < vaultAddresses.length; index++) {
    const infoItem = bindingResults[index * 3];
    const lendingItem = bindingResults[index * 3 + 1];
    const reserveItem = bindingResults[index * 3 + 2];
    if (!infoItem || infoItem.status !== "success") {
      return unavailable(failure("rpc_revert", `ovrfloInfo reverted for vault index ${index}`));
    }
    if (!lendingItem || lendingItem.status !== "success") {
      return unavailable(
        failure("rpc_revert", `ovrfloToLending reverted for vault index ${index}`),
      );
    }
    if (!reserveItem || reserveItem.status !== "success") {
      return unavailable(
        failure("rpc_revert", `ovrfloToReserve reverted for vault index ${index}`),
      );
    }
    const tuple = infoItem.result as readonly [Address, Address, Address];
    const lendingAddress = lendingItem.result as Address;
    const reserveAddress = reserveItem.result as Address;
    if (isZero(reserveAddress)) {
      return unavailable(
        failure("rpc_revert", `ovrfloToReserve returned the zero address for vault index ${index}`),
      );
    }
    const vault = vaultAddresses[index]!;
    vaultByAddress.set(vault.toLowerCase(), { index });
    vaults.push({
      vault,
      treasury: tuple[0],
      underlying: tuple[1],
      ovrfloToken: tuple[2],
      reserve: reserveAddress,
      lending: isZero(lendingAddress) ? null : lendingAddress,
      retiredLendings: [],
    });
  }

  const retired = await attachRetiredLendings(
    client,
    factory,
    blockNumber,
    vaults,
    vaultByAddress,
  );
  if (retired.status === "unavailable") return retired;

  const series = await attachApprovedSeries(client, factory, blockNumber, retired.vaults);
  if (series.status === "unavailable") return series;

  const books = await attachLendingBooks(client, factory, blockNumber, retired.vaults);
  if (books.status === "unavailable") return books;

  const skew = await assertBlockStable(client, blockNumber, blockHash);
  if (skew) return skew;

  return {
    status: "ready",
    factory,
    stream,
    lens,
    vaults: retired.vaults,
    markets: series.markets,
    books: books.books,
    blockNumber,
  };
}

async function verifyDeployedLens(
  client: BootstrapClient,
  lens: Address,
  stream: Address,
  blockNumber: bigint,
): Promise<{ status: "ready" } | Extract<ProtocolBootstrap, { status: "unavailable" }>> {
  if (!isConfiguredAddress(lens)) {
    return unavailable(failure("no_code", "Configured lens is the zero address"));
  }
  let bytecode: Hexish;
  try {
    bytecode = await client.getBytecode({ address: lens });
  } catch (error) {
    return unavailable(
      failure("rpc_revert", error instanceof Error ? error.message : "Lens bytecode read failed"),
    );
  }
  if (!bytecode || bytecode === "0x") {
    return unavailable(failure("no_code", "Lens has no bytecode at the configured address"));
  }
  let lockup: Address;
  try {
    lockup = await client.readContract({
      address: lens,
      abi: ovrfloLensAbi,
      functionName: "lockup",
      blockNumber,
    });
  } catch (error) {
    return unavailable(
      failure("rpc_revert", error instanceof Error ? error.message : "lens.lockup() failed"),
    );
  }
  if (lockup.toLowerCase() !== stream.toLowerCase()) {
    return unavailable(
      failure(
        "rpc_revert",
        `lens.lockup() ${lockup} does not match factory.ovrfloStream() ${stream}`,
      ),
    );
  }
  return { status: "ready" };
}

async function attachRetiredLendings(
  client: BootstrapClient,
  factory: Address,
  blockNumber: bigint,
  vaults: VaultInfo[],
  vaultByAddress: Map<string, { index: number }>,
): Promise<
  | { status: "ready"; vaults: VaultInfo[] }
  | Extract<ProtocolBootstrap, { status: "unavailable" }>
> {
  let countResults: readonly MulticallItem[];
  try {
    countResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: [
        {
          address: factory,
          abi: ovrfloFactoryAbi,
          functionName: "lendingCount",
        },
      ],
    });
  } catch (error) {
    return unavailable(
      failure(
        "rpc_revert",
        error instanceof Error ? error.message : "lendingCount multicall failed",
      ),
    );
  }

  const countItem = countResults[0];
  if (!countItem || countItem.status !== "success") {
    return unavailable(failure("rpc_revert", "lendingCount() reverted or failed"));
  }

  const count = countItem.result as bigint;
  if (count > BigInt(MAX_VAULT_REGISTRY_ENTRIES)) {
    return unavailable(
      failure(
        "budget_exceeded",
        `lendingCount ${count.toString()} exceeds registry budget ${MAX_VAULT_REGISTRY_ENTRIES}`,
      ),
    );
  }

  const lendingN = Number(count);
  if (lendingN === 0) {
    return { status: "ready", vaults };
  }

  let lendingAddressResults: readonly MulticallItem[];
  try {
    lendingAddressResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: Array.from({ length: lendingN }, (_, index) => ({
        address: factory,
        abi: ovrfloFactoryAbi,
        functionName: "lendings" as const,
        args: [BigInt(index)] as const,
      })),
    });
  } catch (error) {
    return unavailable(
      failure("rpc_revert", error instanceof Error ? error.message : "lendings multicall failed"),
    );
  }

  if (lendingAddressResults.length !== lendingN) {
    return unavailable(failure("rpc_revert", "lendings multicall length mismatch"));
  }

  const lendingAddresses: Address[] = [];
  for (let index = 0; index < lendingN; index++) {
    const item = lendingAddressResults[index];
    if (!item || item.status !== "success") {
      return unavailable(failure("rpc_revert", `lendings(${index}) reverted or failed`));
    }
    const market = item.result as Address;
    if (isZero(market)) {
      return unavailable(failure("rpc_revert", `lendings(${index}) returned the zero address`));
    }
    lendingAddresses.push(market);
  }

  let ownerResults: readonly MulticallItem[];
  try {
    ownerResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: lendingAddresses.map((market) => ({
        address: factory,
        abi: ovrfloFactoryAbi,
        functionName: "lendingToOvrflo" as const,
        args: [market] as const,
      })),
    });
  } catch (error) {
    return unavailable(
      failure(
        "rpc_revert",
        error instanceof Error ? error.message : "lendingToOvrflo multicall failed",
      ),
    );
  }

  if (ownerResults.length !== lendingAddresses.length) {
    return unavailable(failure("rpc_revert", "lendingToOvrflo multicall length mismatch"));
  }

  const retiredLists = vaults.map(() => [] as Address[]);
  for (let index = 0; index < lendingAddresses.length; index++) {
    const ownerItem = ownerResults[index];
    if (!ownerItem || ownerItem.status !== "success") {
      return unavailable(
        failure("rpc_revert", `lendingToOvrflo reverted for lendings(${index})`),
      );
    }
    const ownerVault = ownerItem.result as Address;
    if (isZero(ownerVault)) {
      return unavailable(
        failure("rpc_revert", `lendingToOvrflo returned the zero address for lendings(${index})`),
      );
    }
    const owner = vaultByAddress.get(ownerVault.toLowerCase());
    if (!owner) {
      return unavailable(
        failure(
          "rpc_revert",
          `lendingToOvrflo mapped lendings(${index}) to a vault outside the registry`,
        ),
      );
    }
    const market = lendingAddresses[index]!;
    const active = vaults[owner.index]!.lending;
    if (!active || active.toLowerCase() !== market.toLowerCase()) {
      retiredLists[owner.index]!.push(market);
    }
  }

  return {
    status: "ready",
    vaults: vaults.map((vault, index) => ({
      ...vault,
      retiredLendings: retiredLists[index]!,
    })),
  };
}

async function attachApprovedSeries(
  client: BootstrapClient,
  factory: Address,
  blockNumber: bigint,
  vaults: readonly VaultInfo[],
): Promise<
  | { status: "ready"; markets: MarketInfo[] }
  | Extract<ProtocolBootstrap, { status: "unavailable" }>
> {
  if (vaults.length === 0) {
    return { status: "ready", markets: [] };
  }

  let countResults: readonly MulticallItem[];
  try {
    countResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: vaults.map((vault) => ({
        address: factory,
        abi: ovrfloFactoryAbi,
        functionName: "approvedMarketCount" as const,
        args: [vault.vault] as const,
      })),
    });
  } catch (error) {
    return unavailable(
      failure(
        "rpc_revert",
        error instanceof Error ? error.message : "approvedMarketCount multicall failed",
      ),
    );
  }

  if (countResults.length !== vaults.length) {
    return unavailable(failure("rpc_revert", "approvedMarketCount multicall length mismatch"));
  }

  const counts: bigint[] = [];
  let total = 0n;
  for (let index = 0; index < vaults.length; index++) {
    const item = countResults[index];
    if (!item || item.status !== "success") {
      return unavailable(
        failure("rpc_revert", `approvedMarketCount reverted for vault index ${index}`),
      );
    }
    const count = item.result as bigint;
    if (count > BigInt(MAX_VAULT_REGISTRY_ENTRIES)) {
      return unavailable(
        failure(
          "budget_exceeded",
          `approvedMarketCount ${count.toString()} exceeds registry budget ${MAX_VAULT_REGISTRY_ENTRIES}`,
        ),
      );
    }
    total += count;
    counts.push(count);
  }
  if (total > BigInt(MAX_VAULT_REGISTRY_ENTRIES)) {
    return unavailable(
      failure(
        "budget_exceeded",
        `approved market total ${total.toString()} exceeds registry budget ${MAX_VAULT_REGISTRY_ENTRIES}`,
      ),
    );
  }

  if (total === 0n) {
    return { status: "ready", markets: [] };
  }

  let marketAddressResults: readonly MulticallItem[];
  try {
    marketAddressResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: vaults.flatMap((vault, vaultIndex) => {
        const count = Number(counts[vaultIndex]!);
        return Array.from({ length: count }, (_, index) => ({
          address: factory,
          abi: ovrfloFactoryAbi,
          functionName: "approvedMarketAt" as const,
          args: [vault.vault, BigInt(index)] as const,
        }));
      }),
    });
  } catch (error) {
    return unavailable(
      failure(
        "rpc_revert",
        error instanceof Error ? error.message : "approvedMarketAt multicall failed",
      ),
    );
  }

  const expected = Number(total);
  if (marketAddressResults.length !== expected) {
    return unavailable(failure("rpc_revert", "approvedMarketAt multicall length mismatch"));
  }

  const slots: { vault: VaultInfo; market: Address }[] = [];
  let readIndex = 0;
  for (let vaultIndex = 0; vaultIndex < vaults.length; vaultIndex++) {
    const vault = vaults[vaultIndex]!;
    const count = Number(counts[vaultIndex]!);
    for (let offset = 0; offset < count; offset++) {
      const item = marketAddressResults[readIndex++];
      if (!item || item.status !== "success") {
        return unavailable(
          failure("rpc_revert", `approvedMarketAt reverted for vault index ${vaultIndex}`),
        );
      }
      const market = item.result as Address;
      if (isZero(market)) {
        return unavailable(
          failure("rpc_revert", `approvedMarketAt returned the zero address for vault index ${vaultIndex}`),
        );
      }
      slots.push({ vault, market });
    }
  }

  let seriesResults: readonly MulticallItem[];
  try {
    seriesResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: slots.map((slot) => ({
        address: slot.vault.vault,
        abi: ovrfloAbi,
        functionName: "series" as const,
        args: [slot.market] as const,
      })),
    });
  } catch (error) {
    return unavailable(
      failure("rpc_revert", error instanceof Error ? error.message : "series multicall failed"),
    );
  }

  if (seriesResults.length !== slots.length) {
    return unavailable(failure("rpc_revert", "series multicall length mismatch"));
  }

  const markets: MarketInfo[] = [];
  for (let index = 0; index < slots.length; index++) {
    const item = seriesResults[index];
    if (!item || item.status !== "success") {
      return unavailable(failure("rpc_revert", `series reverted for market index ${index}`));
    }
    const tuple = item.result as readonly [
      number,
      number,
      bigint,
      Address,
      Address,
      Address,
      Address,
    ];
    const ptToken = tuple[3];
    if (isZero(ptToken)) continue;
    const vault = slots[index]!.vault;
    markets.push({
      ...vault,
      market: slots[index]!.market,
      twapDurationFixed: tuple[0],
      feeBps: tuple[1],
      expiryCached: tuple[2],
      ptToken,
      ovrfloToken: tuple[4],
      underlying: tuple[5],
      oracle: tuple[6],
    });
  }
  return { status: "ready", markets };
}

function uniqueLendings(vaults: readonly VaultInfo[]): Address[] {
  const seen = new Set<string>();
  const lendings: Address[] = [];
  for (const vault of vaults) {
    const candidates = [
      ...(vault.lending ? [vault.lending] : []),
      ...vault.retiredLendings,
    ];
    for (const lending of candidates) {
      const key = lending.toLowerCase();
      if (seen.has(key) || isZero(lending)) continue;
      seen.add(key);
      lendings.push(lending);
    }
  }
  return lendings;
}

async function attachLendingBooks(
  client: BootstrapClient,
  factory: Address,
  blockNumber: bigint,
  vaults: readonly VaultInfo[],
): Promise<
  | { status: "ready"; books: LendingBookRecord[] }
  | Extract<ProtocolBootstrap, { status: "unavailable" }>
> {
  const lendings = uniqueLendings(vaults);
  if (lendings.length === 0) {
    return { status: "ready", books: [] };
  }

  let routerResults: readonly MulticallItem[];
  try {
    routerResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: lendings.map((lending) => ({
        address: lending,
        abi: ovrfloLendingAbi,
        functionName: "router" as const,
      })),
    });
  } catch (error) {
    return unavailable(
      failure("rpc_revert", error instanceof Error ? error.message : "lending.router multicall failed"),
    );
  }

  if (routerResults.length !== lendings.length) {
    return unavailable(failure("rpc_revert", "lending.router multicall length mismatch"));
  }

  let priorCountResults: readonly MulticallItem[];
  try {
    priorCountResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: lendings.map((lending) => ({
        address: factory,
        abi: ovrfloFactoryAbi,
        functionName: "priorRouterCount" as const,
        args: [lending] as const,
      })),
    });
  } catch (error) {
    return unavailable(
      failure(
        "rpc_revert",
        error instanceof Error ? error.message : "priorRouterCount multicall failed",
      ),
    );
  }

  if (priorCountResults.length !== lendings.length) {
    return unavailable(failure("rpc_revert", "priorRouterCount multicall length mismatch"));
  }

  const priorCounts: bigint[] = [];
  let priorTotal = 0n;
  for (let index = 0; index < lendings.length; index++) {
    const item = priorCountResults[index];
    if (!item || item.status !== "success") {
      return unavailable(
        failure("rpc_revert", `priorRouterCount reverted for lending index ${index}`),
      );
    }
    const count = item.result as bigint;
    if (count > BigInt(MAX_VAULT_REGISTRY_ENTRIES)) {
      return unavailable(
        failure(
          "budget_exceeded",
          `priorRouterCount ${count.toString()} exceeds registry budget ${MAX_VAULT_REGISTRY_ENTRIES}`,
        ),
      );
    }
    priorCounts.push(count);
    priorTotal += count;
  }

  let priorAddressResults: readonly MulticallItem[] = [];
  if (priorTotal > 0n) {
    try {
      priorAddressResults = await client.multicall({
        allowFailure: true,
        blockNumber,
        contracts: lendings.flatMap((lending, lendingIndex) => {
          const count = Number(priorCounts[lendingIndex]!);
          return Array.from({ length: count }, (_, index) => ({
            address: factory,
            abi: ovrfloFactoryAbi,
            functionName: "priorRouterAt" as const,
            args: [lending, BigInt(index)] as const,
          }));
        }),
      });
    } catch (error) {
      return unavailable(
        failure(
          "rpc_revert",
          error instanceof Error ? error.message : "priorRouterAt multicall failed",
        ),
      );
    }
    if (priorAddressResults.length !== Number(priorTotal)) {
      return unavailable(failure("rpc_revert", "priorRouterAt multicall length mismatch"));
    }
  }

  const books: LendingBookRecord[] = [];
  let priorIndex = 0;
  for (let index = 0; index < lendings.length; index++) {
    const routerItem = routerResults[index];
    if (!routerItem || routerItem.status !== "success") {
      return unavailable(failure("rpc_revert", `lending.router reverted for lending index ${index}`));
    }
    const router = routerItem.result as Address;
    const prior: Address[] = [];
    const priorCount = Number(priorCounts[index]!);
    for (let offset = 0; offset < priorCount; offset++) {
      const priorItem = priorAddressResults[priorIndex++];
      if (!priorItem || priorItem.status !== "success") {
        return unavailable(
          failure("rpc_revert", `priorRouterAt reverted for lending index ${index}`),
        );
      }
      const book = priorItem.result as Address;
      if (isZero(book)) {
        return unavailable(
          failure("rpc_revert", `priorRouterAt returned the zero address for lending index ${index}`),
        );
      }
      prior.push(book);
    }
    books.push({
      lending: lendings[index]!,
      currentBook: isZero(router) ? null : router,
      priorBooks: prior,
    });
  }
  return { status: "ready", books };
}

async function assertBlockStable(
  client: BootstrapClient,
  blockNumber: bigint,
  expectedHash: `0x${string}`,
): Promise<Extract<ProtocolBootstrap, { status: "unavailable" }> | null> {
  try {
    const block = await client.getBlock({ blockNumber });
    if (!block.hash || !isAddressEqualableHash(block.hash, expectedHash)) {
      return unavailable(
        failure("block_skew", `Block ${blockNumber.toString()} hash changed during discovery`),
      );
    }
    return null;
  } catch (error) {
    return unavailable(
      failure("rpc_revert", error instanceof Error ? error.message : "Block re-read failed"),
    );
  }
}

function isAddressEqualableHash(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

type Hexish = `0x${string}` | undefined;

type MulticallItem =
  | { status: "success"; result: unknown }
  | { status: "failure"; error?: unknown };
