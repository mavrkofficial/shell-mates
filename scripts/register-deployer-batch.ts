/**
 * Register many agents from one wallet (deployer): register(agentURI) in a loop.
 * Same gas + URI behavior as register-test-agent.ts.
 *
 * Env:
 *   GELATO_RPC_URL (preferred) / INK_RPC_URL / RPC_URL, INK_PRIVATE_KEY / PRIVATE_KEY
 *   PROFILE_START=1 — first profile index (default 1 after index 0 is minted)
 *   PROFILE_END — last profile index inclusive (default: last in profiles.json)
 *   USE_HOSTED_URI=1 — recommended (smaller txs; default true if unset for this script)
 *   INK_REGISTER_DELAY_MS — pause after each confirmed tx (default 300; set 0 to disable)
 *
 * Resume after failure: set PROFILE_START to the index that failed and re-run.
 */
import hre from "hardhat";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createWalletClient, http, defineChain, parseUnits, type Hex } from "viem";
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

function inkFeeOptsGwei() {
  const fallback = "0.005";
  const maxGwei = process.env.INK_MAX_FEE_GWEI ?? process.env.INK_GAS_PRICE_GWEI ?? fallback;
  const tipGwei = process.env.INK_PRIORITY_FEE_GWEI ?? process.env.INK_GAS_PRICE_GWEI ?? fallback;
  return {
    maxFeePerGas: parseUnits(maxGwei, 9),
    maxPriorityFeePerGas: parseUnits(tipGwei, 9),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const rpc = inkRpcUrl();
  const pk = normalizePk(process.env.INK_PRIVATE_KEY || process.env.PRIVATE_KEY);
  const delayMs = Math.max(0, parseInt(process.env.INK_REGISTER_DELAY_MS ?? "300", 10));
  const useHosted =
    process.env.USE_HOSTED_URI === "1" ||
    process.env.USE_HOSTED_URI === "true" ||
    (process.env.USE_HOSTED_URI !== "0" && process.env.USE_HOSTED_URI !== "false");

  const { viem } = await hre.network.connect();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const deployedPath = join(__dirname, "..", "deployed", `ink-${chainId}-lobster-registry.json`);
  if (!existsSync(deployedPath)) {
    throw new Error(`Missing ${deployedPath}`);
  }
  const deployed = JSON.parse(readFileSync(deployedPath, "utf8")) as { identityProxy: Hex };
  const identityAddress = deployed.identityProxy;

  const profilesPath = process.env.PROFILES_JSON || join(__dirname, "..", "data", "profiles.json");
  if (!existsSync(profilesPath)) {
    throw new Error(`Missing ${profilesPath} — run npm run personas:build`);
  }
  const profilesData = JSON.parse(readFileSync(profilesPath, "utf8")) as {
    profiles: { registrationUri: string; registrationUriHosted?: string }[];
  };
  const n = profilesData.profiles.length;
  const start = Math.max(0, parseInt(process.env.PROFILE_START ?? "1", 10));
  const endEnv = process.env.PROFILE_END;
  const end = endEnv !== undefined ? Math.min(n - 1, parseInt(endEnv, 10)) : n - 1;

  if (start > end || n === 0) {
    throw new Error(`Invalid range: PROFILE_START=${start} PROFILE_END=${end} (profiles=${n})`);
  }

  const registry = await viem.getContractAt("LobsterIdentityRegistryUpgradeable", identityAddress);
  const account = privateKeyToAccount(pk);
  const chain = inkChain(rpc);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpc),
  });
  const fees = inkFeeOptsGwei();
  const total = end - start + 1;

  console.log("RPC:", rpc);
  console.log("Identity proxy:", identityAddress);
  console.log("From:", account.address);
  console.log(`Profiles ${start}..${end} (${total} txs)`);
  console.log("URI mode:", useHosted ? "hosted" : "registrationUri (data)");
  console.log("Post-tx delay ms:", delayMs);
  console.log(
    "Gas gwei:",
    process.env.INK_MAX_FEE_GWEI ?? process.env.INK_GAS_PRICE_GWEI ?? "0.005",
    "/",
    process.env.INK_PRIORITY_FEE_GWEI ?? process.env.INK_GAS_PRICE_GWEI ?? "0.005",
  );

  const dataDir = join(__dirname, "..", "data");
  mkdirSync(dataDir, { recursive: true });
  const progressPath = join(dataDir, "register-deployer-progress.json");
  const hashes: { index: number; hash: Hex }[] = [];

  for (let i = start; i <= end; i++) {
    const profile = profilesData.profiles[i];
    if (!profile?.registrationUri) {
      throw new Error(`Missing profile at index ${i}`);
    }
    const agentURI = useHosted && profile.registrationUriHosted ? profile.registrationUriHosted : profile.registrationUri;

    const hash = await walletClient.writeContract({
      address: identityAddress,
      abi: registry.abi,
      functionName: "register",
      args: [agentURI],
      account,
      chain,
      ...fees,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`Tx reverted at profile index ${i} tx ${hash}`);
    }
    hashes.push({ index: i, hash });
    const done = i - start + 1;
    console.log(`[${done}/${total}] index ${i} ok ${hash}`);
    writeFileSync(
      join(dataDir, "register-deployer-checkpoint.json"),
      JSON.stringify({ lastOkIndex: i, nextProfileStart: i + 1, hash, at: new Date().toISOString() }, null, 2),
    );
    if (delayMs > 0 && i < end) {
      await sleep(delayMs);
    }
  }

  writeFileSync(
    progressPath,
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        range: { start, end },
        from: account.address,
        identityProxy: identityAddress,
        txs: hashes,
      },
      null,
      2,
    ),
  );
  console.log("\nWrote", progressPath);
  console.log("Batch complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
