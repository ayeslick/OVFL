import { describe, expect, it } from "vitest";
import {
  fixedCapsuleSegments,
  loanCapsuleConserves,
  loanCapsuleSegments,
  streamCapsuleSegments,
  streamCapsuleUsesWithdrawableAsRepaid,
} from "@/lib/capsule-segments";

const format = (value: bigint) => value.toString();

describe("capsule adapters", () => {
  it("keeps Remaining plus Repaid equal to obligation", () => {
    const input = { obligation: 7_000n, outstanding: 4_800n };
    expect(loanCapsuleConserves(input)).toBe(true);
    const segments = loanCapsuleSegments(input, format);
    expect(segments[0]?.label).toBe("Remaining");
    expect(segments[0]?.amountWei).toBe(4_800n);
    expect(segments[1]?.label).toBe("Repaid");
    expect(segments[1]?.amountWei).toBe(2_200n);
    expect(segments[0]!.amountWei + segments[1]!.amountWei).toBe(7_000n);
  });

  it("does not count stream withdrawable as loan Repaid", () => {
    expect(streamCapsuleUsesWithdrawableAsRepaid()).toBe(false);
    const segments = loanCapsuleSegments(
      { obligation: 100n, outstanding: 40n },
      format,
    );
    expect(segments.find((row) => row.label === "Repaid")?.amountWei).toBe(60n);
  });

  it("maps stream remaining and released without using withdrawable as Remaining", () => {
    const segments = streamCapsuleSegments({ remaining: 80n, released: 20n }, format);
    expect(segments.map((row) => row.label)).toEqual(["Releasing", "Released"]);
    expect(segments[0]?.amountWei).toBe(80n);
    expect(segments[1]?.amountWei).toBe(20n);
  });

  it("shows Waiting for unmatched Fixed Return capital", () => {
    const segments = fixedCapsuleSegments(
      { unmatched: 10n, supplied: 10n, arriving: 0n, arrived: 0n, claimed: 0n },
      format,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]?.label).toBe("Waiting");
    expect(segments[0]?.amountWei).toBe(10n);
  });

  it("keeps unmatched capital on Waiting after a partial match", () => {
    const segments = fixedCapsuleSegments(
      { unmatched: 4n, supplied: 10n, arriving: 5n, arrived: 1n, claimed: 0n },
      format,
    );
    expect(segments.find((row) => row.label === "Waiting")?.amountWei).toBe(4n);
    expect(segments.find((row) => row.label === "Arrived")?.amountWei).toBe(1n);
  });
});
