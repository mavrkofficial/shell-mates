/**
 * Standalone reputation writer — no Hardhat, no nonce management.
 * Sends one tx at a time, waits for confirmation before the next.
 */
import { createPublicClient, createWalletClient, http, defineChain, parseGwei, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const RPC = "https://rpc-qnd.inkonchain.com";
const GWEI = parseGwei("0.005");

const chain = defineChain({
  id: 57073,
  name: "Ink",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let pk = (process.env.INK_PRIVATE_KEY || process.env.PRIVATE_KEY || "").trim();
if (!pk.startsWith("0x")) pk = `0x${pk}`;
const account = privateKeyToAccount(pk);

const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain, transport: http(RPC) });

const deployed = JSON.parse(readFileSync(join(ROOT, "deployed", "ink-57073-lobster-registry.json"), "utf8"));
const repAddr = deployed.reputationProxy;

const abi = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);

const results = JSON.parse(readFileSync(join(ROOT, "simulation", "mirofish-results.json"), "utf8"));
const entries = results.feedbackEntries;

const startIdx = parseInt(process.env.WRITE_START ?? "0", 10);
const endIdx = process.env.WRITE_END ? parseInt(process.env.WRITE_END, 10) : entries.length - 1;
const delayMs = parseInt(process.env.WRITE_DELAY_MS ?? "600", 10);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const total = endIdx - startIdx + 1;
  console.log(`Writer: ${account.address}`);
  console.log(`Reputation: ${repAddr}`);
  console.log(`RPC: ${RPC}`);
  console.log(`Entries: ${startIdx}..${endIdx} (${total} txs)`);
  console.log(`Delay: ${delayMs}ms, Gas: 10 gwei\n`);

  const dataDir = join(ROOT, "data");
  mkdirSync(dataDir, { recursive: true });

  let ok = 0;
  let fail = 0;

  for (let i = startIdx; i <= endIdx; i++) {
    const e = entries[i];
    let done = false;

    for (let attempt = 0; attempt < 5 && !done; attempt++) {
      try {
        const hash = await walletClient.writeContract({
          address: repAddr,
          abi,
          functionName: "giveFeedback",
          args: [
            BigInt(e.agentId),
            BigInt(e.onChainValue),
            e.onChainDecimals,
            e.tag1,
            "",
            "",
            "",
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          ],
          maxFeePerGas: GWEI,
          maxPriorityFeePerGas: GWEI,
        });

        await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
        ok++;
        done = true;

        const n = i - startIdx + 1;
        if (n % 25 === 0 || n === total || n <= 5) {
          console.log(`[${n}/${total}] agent ${e.agentId} (${e.name}) ${e.tag1}=${e.onChainValue} — ${hash}`);
        }
      } catch (err) {
        const msg = err.details || err.shortMessage || err.message || "";
        if (attempt < 4) {
          await sleep(3000 + attempt * 2000);
        } else {
          fail++;
          console.error(`[FAIL] agent ${e.agentId} (${e.name}): ${msg.slice(0, 120)}`);
        }
      }
    }

    writeFileSync(
      join(dataDir, "reputation-write-checkpoint.json"),
      JSON.stringify({ lastIndex: i, nextStart: i + 1, successCount: ok, failCount: fail, at: new Date().toISOString() }, null, 2),
    );

    if (delayMs > 0 && i < endIdx) await sleep(delayMs);
  }

  console.log(`\nDone: ${ok} ok, ${fail} failed out of ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
