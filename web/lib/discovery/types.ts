import type { Hex } from "viem";

export type BlockIdentity = {
  number: bigint;
  hash: Hex;
};
