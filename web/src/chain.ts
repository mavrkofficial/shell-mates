import { defineChain } from "viem";

export const ink = defineChain({
  id: 57073,
  name: "Ink",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_INK_RPC || "https://rpc-gel.inkonchain.com"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.inkonchain.com" },
  },
});
