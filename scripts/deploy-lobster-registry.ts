import hre from "hardhat";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  getContract,
  http,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { writeFileSync } from "fs";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { inkRpcUrl } from "./ink-rpc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function inkChain(rpcUrl: string) {
  return defineChain({
    id: Number.parseInt(process.env.CHAIN_ID || process.env.INK_CHAIN_ID || "57073", 10),
    name: "Ink",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/** viem's http() uses fetch (Node 18+). Hardhat's Undici-based provider can get HTTP 403 from Ink's CDN on large deploy txs. */
function inkTransport(rpcUrl: string) {
  const ua =
    process.env.INK_RPC_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  return http(rpcUrl, {
    fetchOptions: { headers: { "User-Agent": ua } },
  });
}

/** Public Ink RPCs can lag eth_call / getCode right after a deploy; wait until bytecode is visible. */
async function waitForBytecode(publicClient: PublicClient, address: `0x${string}`, label: string) {
  const ms = Number(process.env.INK_POST_DEPLOY_POLL_MS || 2000);
  const max = Number(process.env.INK_POST_DEPLOY_WAIT_MS || 120_000);
  const deadline = Date.now() + max;
  while (Date.now() < deadline) {
    const code = await publicClient.getBytecode({ address });
    if (code && code !== "0x") {
      return;
    }
    await new Promise((r) => setTimeout(r, ms));
  }
  throw new Error(`Timeout: no bytecode yet at ${label} ${address}`);
}

/** Optional gas cap for each deploy tx. Omit to let the RPC estimate (avoids Gel rejecting huge txs). */
function deployOpts() {
  const raw = process.env.INK_DEPLOY_GAS_LIMIT;
  if (!raw || raw === "") return {};
  return { gas: BigInt(raw) };
}

/**
 * Hardhat's viem.deployContract uses viem's default receipt wait (~60s). Large contract deploys on Ink
 * often need longer; this waits up to INK_TX_WAIT_MS (default 15 minutes).
 */
async function deployContractLongWaitImpl(
  contractName: string,
  args: readonly unknown[],
  publicClient: PublicClient,
  walletClient: WalletClient,
  txOpts: { gas?: bigint }
): Promise<{ contract: ReturnType<typeof getContract>; txHash: Hex }> {
  const artifact = await hre.artifacts.readArtifact(contractName);
  const waitMs = Number(process.env.INK_TX_WAIT_MS || 900_000);
  const pollMs = Number(process.env.INK_TX_POLL_MS || 4_000);

  const acct = walletClient.account;
  if (!acct) {
    throw new Error("Wallet client has no account");
  }

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args,
    account: acct,
    chain: walletClient.chain,
    ...(txOpts.gas !== undefined ? { gas: txOpts.gas } : {}),
  });

  console.log(`  … ${contractName} submitted ${hash}`);
  console.log(`  … waiting for receipt (timeout ${Math.floor(waitMs / 1000)}s, poll ${pollMs}ms)`);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: waitMs,
    pollingInterval: pollMs,
  });

  const address = receipt.contractAddress;
  if (!address) {
    throw new Error(`Deploy ${contractName}: no contractAddress in receipt`);
  }
  const contract = getContract({
    address,
    abi: artifact.abi,
    client: { public: publicClient, wallet: walletClient },
  });
  return { contract, txHash: receipt.transactionHash };
}

function explorerAddressUrl(chainId: bigint, address: string) {
  if (chainId === 57073n) {
    return `https://explorer.inkonchain.com/address/${address}`;
  }
  return undefined;
}

function printDeploymentSummary(args: {
  chainId: bigint;
  deployer: string;
  rpcUrl: string;
  outPath: string;
  rows: { label: string; address: string; txHash: Hex }[];
  identityProxy: string;
  reputationProxy: string;
}) {
  const { chainId, deployer, rpcUrl, outPath, rows, identityProxy, reputationProxy } = args;
  const line = "═".repeat(72);
  console.log("");
  console.log(line);
  console.log("  LOBSTER REGISTRY — DEPLOYMENT COMPLETE");
  console.log(line);
  console.log(`  Network:     Ink (chainId ${chainId})`);
  console.log(`  RPC:         ${rpcUrl}`);
  console.log(`  Deployer:    ${deployer}`);
  console.log("");
  console.log("  Contracts (4 tx):");
  for (const r of rows) {
    const ex = explorerAddressUrl(chainId, r.address);
    console.log(`    • ${r.label}`);
    console.log(`      Address: ${r.address}`);
    console.log(`      Tx:      ${r.txHash}`);
    if (ex) console.log(`      Explorer: ${ex}`);
  }
  console.log("");
  console.log("  Saved to:");
  console.log(`    ${outPath}`);
  console.log("");
  console.log("  Set in .env:");
  console.log(`    LOBSTER_REGISTRY=${identityProxy}`);
  console.log(`    LOBSTER_REPUTATION_REGISTRY=${reputationProxy}`);
  console.log("  Vite (if used):");
  console.log(`    VITE_LOBSTER_IDENTITY_REGISTRY=${identityProxy}`);
  console.log(`    VITE_LOBSTER_REPUTATION_REGISTRY=${reputationProxy}`);
  console.log(line);
  console.log("");
}

async function main() {
  const rpcUrl = inkRpcUrl();
  let pk = (process.env.INK_PRIVATE_KEY || process.env.PRIVATE_KEY || "").trim();
  pk = pk.replace(/^["']|["']$/g, "").trim();
  if (!pk) {
    throw new Error("Set INK_PRIVATE_KEY or PRIVATE_KEY in .env");
  }
  if (!pk.startsWith("0x")) {
    pk = `0x${pk}`;
  }
  const chain = inkChain(rpcUrl);
  const transport = inkTransport(rpcUrl);
  const account = privateKeyToAccount(pk as `0x${string}`);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const deployer = walletClient.account.address;
  const chainId = await publicClient.getChainId();
  const opts = deployOpts();

  console.log("Deploying Lobster Tinder ERC-8004 stack (Identity + Reputation, hackathon-only)");
  console.log("Chain ID:", chainId);
  console.log("Deployer:", deployer);
  if ("gas" in opts) {
    console.log("Using INK_DEPLOY_GAS_LIMIT:", String(opts.gas));
  }

  const { contract: idImpl, txHash: idImplTx } = await deployContractLongWaitImpl(
    "LobsterIdentityRegistryUpgradeable",
    [],
    publicClient,
    walletClient,
    opts
  );
  console.log("Identity implementation:", idImpl.address);
  await waitForBytecode(publicClient, idImpl.address, "identity implementation");

  const idInit = encodeFunctionData({
    abi: idImpl.abi,
    functionName: "initialize",
    args: [deployer],
  }) as Hex;

  const { contract: identityProxy, txHash: identityProxyTx } = await deployContractLongWaitImpl(
    "ERC1967Proxy",
    [idImpl.address, idInit],
    publicClient,
    walletClient,
    opts
  );
  const identityProxyAddress = identityProxy.address;
  console.log("Identity proxy (mint agents here):", identityProxyAddress);

  const idArtifact = await hre.artifacts.readArtifact("LobsterIdentityRegistryUpgradeable");
  await waitForBytecode(publicClient, identityProxyAddress, "identity proxy");
  const idRegistry = getContract({
    address: identityProxyAddress,
    abi: idArtifact.abi,
    client: { public: publicClient, wallet: walletClient },
  });
  console.log("Identity version:", await idRegistry.read.getVersion());

  const { contract: repImpl, txHash: repImplTx } = await deployContractLongWaitImpl(
    "LobsterReputationRegistryUpgradeable",
    [],
    publicClient,
    walletClient,
    opts
  );
  console.log("Reputation implementation:", repImpl.address);
  await waitForBytecode(publicClient, repImpl.address, "reputation implementation");

  const repInit = encodeFunctionData({
    abi: repImpl.abi,
    functionName: "initialize",
    args: [identityProxyAddress, deployer],
  }) as Hex;

  const { contract: reputationProxy, txHash: reputationProxyTx } = await deployContractLongWaitImpl(
    "ERC1967Proxy",
    [repImpl.address, repInit],
    publicClient,
    walletClient,
    opts
  );
  const reputationProxyAddress = reputationProxy.address;
  console.log("Reputation proxy (giveFeedback here):", reputationProxyAddress);

  const repArtifact = await hre.artifacts.readArtifact("LobsterReputationRegistryUpgradeable");
  await waitForBytecode(publicClient, reputationProxyAddress, "reputation proxy");
  const repRegistry = getContract({
    address: reputationProxyAddress,
    abi: repArtifact.abi,
    client: { public: publicClient, wallet: walletClient },
  });
  console.log("Reputation version:", await repRegistry.read.getVersion());
  console.log("Linked identity:", await repRegistry.read.getIdentityRegistry());

  const outDir = join(__dirname, "..", "deployed");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `ink-${chainId}-lobster-registry.json`);
  const payload = {
    chainId,
    network: "ink",
    deployer,
    identityProxy: identityProxyAddress,
    identityImplementation: idImpl.address,
    reputationProxy: reputationProxyAddress,
    reputationImplementation: repImpl.address,
    hotOrNotTag: "hotOrNot",
    note: "Use identityProxy for register/tokenURI. Use reputationProxy for giveFeedback. Tag attractiveness as tag1=hotOrNot, value 0-100, valueDecimals=0 per EIP-8004.",
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));

  printDeploymentSummary({
    chainId: BigInt(chainId),
    deployer,
    rpcUrl,
    outPath,
    identityProxy: identityProxyAddress,
    reputationProxy: reputationProxyAddress,
    rows: [
      {
        label: "LobsterIdentityRegistryUpgradeable (implementation)",
        address: idImpl.address,
        txHash: idImplTx,
      },
      {
        label: "ERC1967Proxy — Identity (mint / register here)",
        address: identityProxyAddress,
        txHash: identityProxyTx,
      },
      {
        label: "LobsterReputationRegistryUpgradeable (implementation)",
        address: repImpl.address,
        txHash: repImplTx,
      },
      {
        label: "ERC1967Proxy — Reputation (giveFeedback here)",
        address: reputationProxyAddress,
        txHash: reputationProxyTx,
      },
    ],
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
