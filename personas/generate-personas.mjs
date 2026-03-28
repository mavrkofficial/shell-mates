/**
 * MiroFish-inspired batch personas (text). Writes personas/out/lobsters.json
 * For richer output, set OPENAI_API_KEY + OPENAI_BASE_URL or use defaults (template lobsters).
 */
import dotenv from "dotenv";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env"), quiet: true });

const count = Math.max(1, parseInt(process.env.LOBSTER_COUNT || "8", 10));
const imageExt = (process.env.LOBSTER_IMAGE_EXT || "gif").replace(/^\./, "");
/** PFP path after `npm run personas:8bit-gif` (or `personas:8bit` for static PNG) */
const defaultImagePath = (i) => `/lobsters/${i}.${imageExt}`;

const firstNames = ["Clawdia", "Pinchy", "Shelly", "Bisque", "Coral", "Nori", "Kelp", "Reef"];
const vibes = ["chaotic romantic", "soft-shell poet", "venture capitalist", "mermaid DJ", "crypto maximalist", "sushi critic"];

/** Strip ```json fences and isolate outermost `{...}` for parse. */
function parseLobsterPayload(text) {
  let t = (text || "").trim();
  t = t.replace(/^```(?:json)?\s*\r?\n?/i, "");
  t = t.replace(/\r?\n?```\s*$/i, "");
  t = t.trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) {
    t = t.slice(first, last + 1);
  }
  return JSON.parse(t);
}

function templateLobster(i) {
  const name = `${firstNames[i % firstNames.length]} ${i + 1}`;
  const vibe = vibes[i % vibes.length];
  return {
    name,
    tagline: `Lobster on Ink looking for the one (or the next block).`,
    bio: `${name} is a ${vibe} crustacean. Into long walks on the seabed and verifiable agent identity (ERC-8004). Swipe right if you like trustless vibes.`,
    quirks: ["quotes SpongeBob unironically", "stores memes onchain", "thinks claws are a personality"],
    imagePath: defaultImagePath(i),
  };
}

async function llmPersonas() {
  const rawKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  const key = typeof rawKey === "string" ? rawKey.trim() : "";
  const base = (process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const batchSize = Math.max(
    1,
    Math.min(parseInt(process.env.LLM_BATCH_SIZE || "15", 10), count)
  );
  if (!key) {
    console.warn("No OPENAI_API_KEY (or LLM_API_KEY) in .env after load — using template personas.");
    return null;
  }

  async function callLlm(userContent, temperature) {
    const payload = {
      model,
      messages: [{ role: "user", content: userContent }],
      temperature,
      max_tokens: 16384,
    };
    if (process.env.LLM_JSON_OBJECT !== "0" && process.env.LLM_JSON_OBJECT !== "false") {
      payload.response_format = { type: "json_object" };
    }
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`LLM request failed (${res.status} ${res.statusText}):`, errBody.slice(0, 500));
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    try {
      return parseLobsterPayload(text);
    } catch (e) {
      console.warn("LLM returned non-JSON:", (text || "").slice(0, 500));
      return null;
    }
  }

  const all = [];
  let totalPadded = 0;
  const maxTopUps = parseInt(process.env.LLM_MAX_TOPUPS || "8", 10);

  for (let offset = 0; offset < count; offset += batchSize) {
    const n = Math.min(batchSize, count - offset);
    const batchNum = Math.floor(offset / batchSize) + 1;
    const totalBatches = Math.ceil(count / batchSize);
    const batch = [];
    let topUps = 0;

    while (batch.length < n && topUps < maxTopUps) {
      const need = n - batch.length;
      const isFirst = topUps === 0;
      const userContent = isFirst
        ? `Generate exactly ${need} funny dating-profile objects for anthropomorphic lobsters (batch ${batchNum}/${totalBatches}). Each object must have: "name", "tagline", "bio", "quirks" (array of exactly 3 short strings). Return JSON only: {"lobsters":[...]} with exactly ${need} objects in the array — the array length must be ${need}.`
        : `The array was too short. Return JSON only: {"lobsters":[...]} with exactly ${need} NEW distinct lobster dating profiles (different names). The lobsters array must have length ${need}, no fewer.`;

      const json = await callLlm(userContent, isFirst ? 0.9 : 0.75);
      if (!json || !Array.isArray(json.lobsters)) {
        break;
      }
      for (const item of json.lobsters) {
        if (batch.length >= n) break;
        batch.push(item);
      }
      topUps++;
    }

    while (batch.length < n) {
      batch.push(templateLobster(offset + batch.length));
      totalPadded++;
    }
    all.push(...batch.slice(0, n));
  }

  if (totalPadded > 0) {
    console.warn(`Filled ${totalPadded} slots with template personas (model rarely hit exact batch counts).`);
  }
  return all;
}

async function main() {
  const outDir = join(__dirname, "out");
  mkdirSync(outDir, { recursive: true });

  let lobsters = await llmPersonas();
  if (!lobsters || !Array.isArray(lobsters) || lobsters.length === 0) {
    console.log("Using template personas (LLM unavailable or returned nothing).");
    lobsters = Array.from({ length: count }, (_, i) => templateLobster(i));
  } else if (lobsters.length < count) {
    console.warn(
      `LLM returned ${lobsters.length} profiles; padding to ${count} with template entries for missing indices.`
    );
    for (let i = lobsters.length; i < count; i++) {
      lobsters.push(templateLobster(i));
    }
  } else {
    lobsters = lobsters.slice(0, count);
  }

  for (let i = 0; i < lobsters.length; i++) {
    if (!lobsters[i].imagePath) lobsters[i].imagePath = defaultImagePath(i);
  }

  writeFileSync(join(outDir, "lobsters.json"), JSON.stringify({ lobsters }, null, 2));
  console.log("Wrote personas/out/lobsters.json");
}

main().catch(console.error);
