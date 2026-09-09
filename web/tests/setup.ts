import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { resetDisclosure } from "@/lib/disclosure";

afterEach(() => {
  resetDisclosure();
});

// Unit tests import `@/lib/config` at module load. A missing factory address
// must fail the real boot; tests that are not exercising that gate get a
// non-zero placeholder so collection does not collapse. config.test.ts unstubs
// this key and asserts the loud fail itself.
if (!process.env.NEXT_PUBLIC_OVRFLO_FACTORY) {
  process.env.NEXT_PUBLIC_OVRFLO_FACTORY =
    "0x1111111111111111111111111111111111111111";
}
if (!process.env.NEXT_PUBLIC_OVRFLO_LENS) {
  process.env.NEXT_PUBLIC_OVRFLO_LENS =
    "0x2222222222222222222222222222222222222222";
}
