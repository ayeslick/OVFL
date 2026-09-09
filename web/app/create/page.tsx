"use client";

import { DefaultHub } from "@/components/kit/DefaultHub";
import { Shell } from "@/components/kit/Shell";
import { WalletButton } from "wallet-runtime";

export default function CreatePage() {
  return (
    <Shell currentNav="create" wallet={<WalletButton />}>
      <DefaultHub
        welcome="Choose an OVRFLO"
        backHref="/"
        backLabel="Your OVRFLO"
        returnHref="/create/"
      />
    </Shell>
  );
}
