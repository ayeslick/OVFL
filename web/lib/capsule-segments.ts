export const CAPSULE_BLUE = "var(--loan)";
export const CAPSULE_PALE = "var(--pale)";
export const CAPSULE_CLAIMED = "var(--claimed)";
export const CAPSULE_WAITING = "var(--waiting-fill)";

export type CapsuleSegment = {
  label: string;
  amountWei: bigint;
  text: string;
  color: string;
  light?: boolean;
};

export type LoanCapsuleInput = {
  waiting?: boolean;
  waitingAmount?: bigint;
  obligation: bigint;
  outstanding: bigint;
};

export type StreamCapsuleInput = {
  remaining: bigint;
  released: bigint;
};

export type FixedCapsuleInput = {
  unmatched: bigint;
  supplied: bigint;
  arriving: bigint;
  arrived: bigint;
  claimed: bigint;
};

function positive(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

/** Remaining + Repaid always equals obligation. Withdrawable is not Repaid. */
export function loanCapsuleSegments(
  input: LoanCapsuleInput,
  format: (value: bigint) => string,
): CapsuleSegment[] {
  if (input.waiting) {
    const amount = positive(input.waitingAmount ?? 0n);
    return [
      {
        label: "Waiting",
        amountWei: amount,
        text: format(amount),
        color: CAPSULE_PALE,
      },
    ];
  }
  const remaining = positive(input.outstanding);
  const repaid = positive(input.obligation - remaining);
  return [
    { label: "Remaining", amountWei: remaining, text: format(remaining), color: CAPSULE_BLUE, light: true },
    { label: "Repaid", amountWei: repaid, text: format(repaid), color: CAPSULE_PALE },
  ];
}

export function streamCapsuleSegments(
  input: StreamCapsuleInput,
  format: (value: bigint) => string,
): CapsuleSegment[] {
  const releasing = positive(input.remaining);
  const released = positive(input.released);
  return [
    { label: "Releasing", amountWei: releasing, text: format(releasing), color: CAPSULE_BLUE, light: true },
    { label: "Released", amountWei: released, text: format(released), color: CAPSULE_PALE },
  ];
}

export function fixedCapsuleSegments(
  input: FixedCapsuleInput,
  format: (value: bigint) => string,
): CapsuleSegment[] {
  if (input.arriving === 0n && input.arrived === 0n && input.claimed === 0n) {
    const waiting = positive(input.unmatched > 0n ? input.unmatched : input.supplied);
    return [
      {
        label: input.unmatched > 0n ? "Waiting" : "Withdrawn",
        amountWei: waiting,
        text: format(waiting),
        color: CAPSULE_PALE,
      },
    ];
  }
  return [
    {
      label: "Arriving",
      amountWei: positive(input.arriving),
      text: format(positive(input.arriving)),
      color: CAPSULE_BLUE,
      light: true,
    },
    {
      label: "Arrived",
      amountWei: positive(input.arrived),
      text: format(positive(input.arrived)),
      color: CAPSULE_PALE,
    },
    {
      label: "Claimed",
      amountWei: positive(input.claimed),
      text: format(positive(input.claimed)),
      color: CAPSULE_CLAIMED,
    },
    {
      label: "Waiting",
      amountWei: positive(input.unmatched),
      text: format(positive(input.unmatched)),
      color: CAPSULE_WAITING,
    },
  ];
}

export function loanCapsuleConserves(input: LoanCapsuleInput): boolean {
  if (input.waiting) return true;
  const remaining = positive(input.outstanding);
  const repaid = positive(input.obligation - remaining);
  return remaining + repaid === (input.obligation < 0n ? 0n : input.obligation);
}

export function streamCapsuleUsesWithdrawableAsRepaid(): boolean {
  return false;
}

export function segmentWeights(segments: readonly CapsuleSegment[]): number[] {
  const total = segments.reduce((sum, row) => sum + (row.amountWei < 0n ? 0n : row.amountWei), 0n);
  if (total <= 0n) return segments.map(() => 0);
  return segments.map((row) => Number((positive(row.amountWei) * 1_000_000n) / total) / 1_000_000);
}
