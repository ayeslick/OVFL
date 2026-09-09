import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import contract from "@/fixtures/discovery/performance-contract-v1.json";
import webPackage from "../../package.json";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("pre-U3 performance contract", () => {
  it("freezes the four R50 ceilings", () => {
    expect(Object.values(contract.tasks).map((task) => task.ceilingMs)).toEqual([
      2000,
      5000,
      5000,
      15000,
    ]);
    expect(contract.lockedBeforeUnit).toBe("U3");
  });

  it("freezes the constrained client and R49 stop threshold", () => {
    expect(contract.clients.constrainedMobileClass.cpuThrottleRate).toBe(4);
    expect(contract.clients.constrainedMobileClass.memoryMiB).toBe(2048);
    expect(contract.validHistoryChurn.gasPriceGwei).toBe(10);
    expect(contract.validHistoryChurn.minimumAttackCostEth).toBe(10);
    expect(contract.validHistoryChurn.minimumAttackGas).toBe("1000000000");
    expect(contract.validHistoryChurn.stopDecision).toMatch(/stop scanner implementation/i);
  });
});

describe("CS5 public-read dependency isolation", () => {
  it("does not ship @morpho-org/viem-dlc", () => {
    expect(
      (webPackage.dependencies as Record<string, string | undefined>)["@morpho-org/viem-dlc"],
    ).toBeUndefined();
    const dlcImport = /from ["']@morpho-org\/viem-dlc(?:\/[^"']+)?["']/;
    expect(readFileSync(join(webRoot, "lib/rpc.ts"), "utf8")).not.toMatch(dlcImport);
    expect(readFileSync(join(webRoot, "lib/query-client.ts"), "utf8")).not.toMatch(dlcImport);
    expect(readFileSync(join(webRoot, "lib/wagmi.ts"), "utf8")).not.toMatch(dlcImport);
    expect(readFileSync(join(webRoot, "hooks/useWriteFlow.ts"), "utf8")).not.toMatch(dlcImport);
    expect(readFileSync(join(webRoot, "components/WalletRuntime.tsx"), "utf8")).not.toMatch(dlcImport);
    expect(readFileSync(join(webRoot, "tests/e2e/support/WalletRuntime.tsx"), "utf8")).not.toMatch(dlcImport);
    expect(readFileSync(join(webRoot, "tests/e2e/fixtures/chain.ts"), "utf8")).not.toMatch(dlcImport);
    expect(readFileSync(join(webRoot, "lib/protocol/lending.ts"), "utf8")).not.toMatch(dlcImport);
    expect(readFileSync(join(webRoot, "hooks/useWriteFlow.ts"), "utf8")).toMatch(/getWalletClient/);
  });
});
