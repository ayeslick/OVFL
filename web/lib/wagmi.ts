"use client";

import { createConfig, http, type Config } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { rpcUrls } from "./config";
import { createOrderedReadTransport, READ_TIMEOUT_MS } from "./rpc";

export const wagmiConfig: Config = createConfig({
  ssr: true,
  chains: [mainnet],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [mainnet.id]: createOrderedReadTransport(
      rpcUrls.map((url) => http(url, { timeout: READ_TIMEOUT_MS, retryCount: 0 })),
    ),
  },
});
