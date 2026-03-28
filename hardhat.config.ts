import "@nomicfoundation/hardhat-ethers";

import type { HardhatUserConfig } from "hardhat/config";

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import dotenv from "dotenv";
import { parseUnits } from "viem";

dotenv.config();

/**
 * Ink (OP stack) works best with EIP-1559. Set both fees in gwei (defaults are cheap).
 * If unset, Hardhat uses automatic gas pricing (recommended if deploys revert).
 */
const inkFeeEnv = process.env.INK_MAX_FEE_GWEI ?? process.env.INK_GAS_PRICE_GWEI;
const inkTipEnv = process.env.INK_PRIORITY_FEE_GWEI ?? process.env.INK_GAS_PRICE_GWEI;
const useManualFees = inkFeeEnv !== undefined && inkFeeEnv !== "";
const inkMaxFee = useManualFees ? parseUnits(inkFeeEnv || "0.02", 9) : undefined;
const inkPriorityFee = useManualFees ? parseUnits(inkTipEnv || inkFeeEnv || "0.02", 9) : undefined;

const inkChainId = Number.parseInt(process.env.CHAIN_ID || process.env.INK_CHAIN_ID || "57073", 10);
const inkRpcUrl =
  process.env.GELATO_RPC_URL || process.env.INK_RPC_URL || process.env.RPC_URL || "https://rpc-gel.inkonchain.com";
const inkPrivateKey = process.env.INK_PRIVATE_KEY || process.env.PRIVATE_KEY;

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViemPlugin],
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
  },
  chainDescriptors: {
    57073: {
      name: "Ink",
      blockExplorers: {
        blockscout: {
          url: "https://explorer.inkonchain.com",
          apiUrl: "https://explorer.inkonchain.com/api",
        },
      },
    },
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    ink: {
      type: "http",
      chainType: "op",
      url: inkRpcUrl,
      accounts: inkPrivateKey ? [inkPrivateKey] : [],
      chainId: inkChainId,
      // Official Ink RPCs sit behind CDNs that may return HTTP 403 to Hardhat's default User-Agent on
      // large JSON-RPC payloads (e.g. contract deploy). Override with a normal browser-like UA.
      httpHeaders: {
        "User-Agent":
          process.env.INK_RPC_USER_AGENT ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      ...(useManualFees && inkMaxFee !== undefined && inkPriorityFee !== undefined
        ? { maxFeePerGas: inkMaxFee, maxPriorityFeePerGas: inkPriorityFee }
        : {}),
    },
  },
};

export default config;
