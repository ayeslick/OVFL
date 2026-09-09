import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { custom } from "viem";
import { classifyRpcFailure, createOrderedReadTransport } from "@/lib/rpc";
import webPackage from "../../package.json";

describe("RPC failure classification", () => {
  it.each([
    [{ status: 403 }, "forbidden"],
    [{ status: 429 }, "rate_limited"],
    [new Error("monthly compute-unit quota exhausted"), "quota_exhausted"],
    [new Error("API key revoked"), "revoked_credential"],
    [new Error("unknown block"), "unknown_block"],
    ["unknown block", "unknown_block"],
    [new Error("header not found"), "unknown_block"],
  ] as const)("classifies %j as %s", (error, expected) => {
    expect(classifyRpcFailure(error)).toBe(expected);
  });

  it("classifies an execution revert separately from transport availability", () => {
    expect(classifyRpcFailure(Object.assign(new Error("execution reverted"), { code: 3 }))).toBe(
      "execution_reverted",
    );
  });
});

describe("ordered transports", () => {
  it("uses a first-party ordered fallback, not viem-dlc", () => {
    const transport = createOrderedReadTransport([
      custom({ request: async () => "0x1" }),
    ])({ chain: undefined });
    expect(transport.config.type).toBe("ovrflo-ordered-fallback");
  });

  it("uses the secondary ordinary-read transport after a primary transport failure", async () => {
    const primary = vi.fn().mockRejectedValue(new Error("network unavailable"));
    const secondary = vi.fn().mockResolvedValue("0x1");
    const transport = createOrderedReadTransport([
      custom({ request: primary }),
      custom({ request: secondary }),
    ])({ chain: undefined });

    await expect(transport.request({ method: "eth_chainId" })).resolves.toBe("0x1");
    expect(primary).toHaveBeenCalledOnce();
    expect(secondary).toHaveBeenCalledOnce();
  });

  it("does not replay an execution revert on an ordinary-read fallback", async () => {
    const revert = Object.assign(new Error("execution reverted"), { code: 3 });
    const primary = vi.fn().mockRejectedValue(revert);
    const secondary = vi.fn().mockResolvedValue("0x1");
    const transport = createOrderedReadTransport([
      custom({ request: primary }),
      custom({ request: secondary }),
    ])({ chain: undefined });

    await expect(transport.request({ method: "eth_call", params: [] })).rejects.toThrow(/execution reverted/i);
    expect(primary).toHaveBeenCalledOnce();
    expect(secondary).not.toHaveBeenCalled();
  });

  it("does not fail over on an unknown-block pin miss", async () => {
    const missing = Object.assign(new Error("unknown block"), { code: -32000 });
    const primary = vi.fn().mockRejectedValue(missing);
    const secondary = vi.fn().mockResolvedValue("0x1");
    const transport = createOrderedReadTransport([
      custom({ request: primary }),
      custom({ request: secondary }),
    ])({ chain: undefined });

    await expect(transport.request({ method: "eth_call", params: [] })).rejects.toThrow(/unknown block/i);
    expect(primary).toHaveBeenCalledOnce();
    expect(secondary).not.toHaveBeenCalled();
  });
});

describe("public-read / write boundary", () => {
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

  it("keeps lending hydration on readContract and wallet writes off scanner RPC", () => {
    const lending = readFileSync(join(webRoot, "lib/protocol/lending.ts"), "utf8");
    expect(lending).not.toMatch(/stateOverride/);
    expect(lending).not.toMatch(/from ["']@morpho-org\/viem-dlc/);
    const writeFlow = readFileSync(join(webRoot, "hooks/useWriteFlow.ts"), "utf8");
    expect(writeFlow).not.toMatch(/from ["']@morpho-org\/viem-dlc/);
    expect(writeFlow).toMatch(/getWalletClient/);
    const wagmi = readFileSync(join(webRoot, "lib/wagmi.ts"), "utf8");
    expect(wagmi).not.toMatch(/from ["']@morpho-org\/viem-dlc/);
    const rpc = readFileSync(join(webRoot, "lib/rpc.ts"), "utf8");
    expect(rpc).not.toMatch(/logsDivider/);
    expect(rpc).not.toMatch(/from ["']@morpho-org\/viem-dlc/);
    expect(
      (webPackage.dependencies as Record<string, string | undefined>)["@morpho-org/viem-dlc"],
    ).toBeUndefined();
  });
});
