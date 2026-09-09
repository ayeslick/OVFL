"use client";

import { useConnection } from "wagmi";
import { WalletButton } from "wallet-runtime";
import { DefaultHub } from "@/components/kit/DefaultHub";
import { Shell } from "@/components/kit/Shell";
import { StatusLine } from "@/components/kit/StatusLine";

export default function CreatePage() {
  const connection = useConnection();
  return (
    <Shell
      currentNav="create"
      wallet={<WalletButton />}
      status={<StatusLine status="synced" />}
    >
      {connection.status !== "connected" ? (
        <p>CONNECT WALLET to create a Self-Repaying Loan, a Stream, or a Fixed Return.</p>
      ) : null}
      <DefaultHub welcome="Choose a position type" />
    </Shell>
  );
}
