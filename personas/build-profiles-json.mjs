/**
 * Builds EIP-8004 registration JSON files + data/profiles.json for on-chain mint.
 * Env: PUBLIC_BASE_URL (e.g. https://you.github.io/lobster-tinder or http://localhost:5173)
 *      LOBSTER_REGISTRY — 0x address of Lobster Identity proxy on Ink
 */
import "dotenv/config";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const EIP8004_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
const CHAIN_ID = process.env.CHAIN_ID || "57073";

/** EIP-8004 registration-v1 embedded as a data URI (same pattern as canonical Ink identity txs). */
function toDataUriRegistrationV1(registration) {
  const compact = JSON.stringify(registration);
  const b64 = Buffer.from(compact, "utf8").toString("base64");
  return `data:application/json;base64,${b64}`;
}

async function main() {
  const base =
    process.env.PUBLIC_BASE_URL || "http://localhost:5173";
  const registry = (process.env.LOBSTER_REGISTRY || "").toLowerCase();
  if (!registry.startsWith("0x")) {
    console.error("Set LOBSTER_REGISTRY to your deployed Lobster Identity proxy address.");
    process.exit(1);
  }

  const lobstersPath = join(__dirname, "out", "lobsters.json");
  if (!existsSync(lobstersPath)) {
    console.error("Missing personas/out/lobsters.json — run personas:generate then personas:8bit-gif (or personas:8bit / personas:art)");
    process.exit(1);
  }
  const { lobsters } = JSON.parse(readFileSync(lobstersPath, "utf8"));

  /** `data` = inline base64 JSON for register(agentURI) (recommended). `https` = URL to hosted JSON (smaller calldata). */
  const uriMode = (process.env.REGISTRATION_URI_MODE || "data").toLowerCase();

  const regDir = join(__dirname, "..", "web", "public", "registrations");
  mkdirSync(regDir, { recursive: true });

  const profiles = [];

  for (let i = 0; i < lobsters.length; i++) {
    const L = lobsters[i];
    const imageUrl = L.imagePath ? `${base.replace(/\/$/, "")}${L.imagePath}` : `${base}/placeholder.png`;
    const registration = {
      type: EIP8004_TYPE,
      name: L.name,
      description: [L.tagline, L.bio].filter(Boolean).join("\n\n"),
      image: imageUrl,
      services: [
        { name: "web", endpoint: base },
        { name: "LobsterTinder", endpoint: `${base}/#/lobster/${i}` },
      ],
      x402Support: false,
      active: true,
      registrations: [
        {
          agentId: i,
          agentRegistry: `eip155:${CHAIN_ID}:${registry}`,
        },
      ],
      supportedTrust: ["reputation"],
      lobsterIndex: i,
    };

    const file = join(regDir, `${i}.json`);
    writeFileSync(file, JSON.stringify(registration, null, 2));
    const hostedUri = `${base.replace(/\/$/, "")}/registrations/${i}.json`;
    profiles.push({
      registrationUri:
        uriMode === "https" ? hostedUri : toDataUriRegistrationV1(registration),
      ...(uriMode === "data" ? { registrationUriHosted: hostedUri } : {}),
    });
  }

  const dataDir = join(__dirname, "..", "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "profiles.json"), JSON.stringify({ profiles }, null, 2));
  console.log("Wrote web/public/registrations/*.json and data/profiles.json");
  console.log(
    `registrationUri mode: ${uriMode} — bulk-mint uses registrationUri (EIP-8004 registration-v1).`,
  );
  if (uriMode === "data") {
    console.log("Each profile also has registrationUriHosted for the same JSON over HTTPS.");
  } else {
    console.log("Ensure PUBLIC_BASE_URL matches where you host the /registrations static files.");
  }
}

main().catch(console.error);
