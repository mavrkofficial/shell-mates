/**
 * Upgrade the LobsterReputationRegistryUpgradeable proxy to a new implementation
 * that removes the self-feedback restriction (allows deployer to write scores).
 *
 * Uses UUPS upgradeToAndCall on the existing proxy.
 */
import hre from "hardhat";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  createWalletClient,
  createPublicClient,
  defineChain,
  encodeFunctionData,
  http,
  parseUnits,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { inkRpcUrl } from "./ink-rpc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function normalizePk(raw: string | undefined): Hex {
  if (!raw?.trim()) throw new Error("Set INK_PRIVATE_KEY or PRIVATE_KEY in .env");
  let s = raw.trim().replace(/^["']|["']$/g, "");
  if (!s.startsWith("0x")) s = `0x${s}`;
  return s as Hex;
}

function inkChain(rpc: string) {
  return defineChain({
    id: 57073,
    name: "Ink",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
}

function inkTransport(rpc: string) {
  const ua =
    process.env.INK_RPC_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  return http(rpc, { fetchOptions: { headers: { "User-Agent": ua } } });
}

function inkFees() {
  const fallback = "0.005";
  const maxGwei = process.env.INK_MAX_FEE_GWEI ?? process.env.INK_GAS_PRICE_GWEI ?? fallback;
  const tipGwei = process.env.INK_PRIORITY_FEE_GWEI ?? process.env.INK_GAS_PRICE_GWEI ?? fallback;
  return {
    maxFeePerGas: parseUnits(maxGwei, 9),
    maxPriorityFeePerGas: parseUnits(tipGwei, 9),
  };
}

async function main() {
  const rpc = inkRpcUrl();
  const pk = normalizePk(process.env.INK_PRIVATE_KEY || process.env.PRIVATE_KEY);
  const chain = inkChain(rpc);
  const account = privateKeyToAccount(pk);
  const fees = inkFees();

  const { viem } = await hre.network.connect();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const walletClient = createWalletClient({
    account,
    chain,
    transport: inkTransport(rpc),
  });

  const deployedPath = join(__dirname, "..", "deployed", `ink-${chainId}-lobster-registry.json`);
  const deployed = JSON.parse(readFileSync(deployedPath, "utf8"));
  const reputationProxy = deployed.reputationProxy as Hex;

  console.log("Chain:", chainId);
  console.log("From:", account.address);
  console.log("Reputation proxy:", reputationProxy);
  console.log("RPC:", rpc);

  // Step 1: Deploy new implementation
  console.log("\nDeploying new LobsterReputationRegistryUpgradeable implementation...");

  const artifact = await hre.artifacts.readArtifact("LobsterReputationRegistryUpgradeable");

  const deployHash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
    account,
    chain,
    ...fees,
  });

  console.log("Deploy tx:", deployHash);
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });

  if (deployReceipt.status !== "success") {
    throw new Error(`Deploy reverted: ${deployHash}`);
  }

  const newImpl = deployReceipt.contractAddress!;
  console.log("New implementation:", newImpl);

  // Step 2: Call upgradeToAndCall on the proxy
  console.log("\nUpgrading proxy to new implementation...");

  const proxyContract = await viem.getContractAt(
    "LobsterReputationRegistryUpgradeable",
    reputationProxy,
  );

  const upgradeHash = await walletClient.writeContract({
    address: reputationProxy,
    abi: proxyContract.abi,
    functionName: "upgradeToAndCall",
    args: [newImpl, "0x"],
    account,
    chain,
    ...fees,
  });

  console.log("Upgrade tx:", upgradeHash);
  const upgradeReceipt = await publicClient.waitForTransactionReceipt({ hash: upgradeHash });

  if (upgradeReceipt.status !== "success") {
    throw new Error(`Upgrade reverted: ${upgradeHash}`);
  }

  console.log("Upgrade successful!");

  // Update deployed info
  deployed.reputationImpl = newImpl;
  deployed.reputationUpgradedAt = new Date().toISOString();
  deployed.reputationUpgradeTx = upgradeHash;
  writeFileSync(deployedPath, JSON.stringify(deployed, null, 2));
  console.log("\nUpdated", deployedPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
