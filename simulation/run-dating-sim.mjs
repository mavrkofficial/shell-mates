/**
 * SHELL Mates — MiroFish-inspired dating simulation.
 *
 * Uses Anthropic Claude (same engine as molty-swarm) to run a multi-agent
 * speed-dating event for all 1000 lobster identities. Each round, a table
 * of ~10 lobsters chat, flirt, and rate each other. After all rounds the
 * results are merged into a single leaderboard.
 *
 * Output: simulation/prediction-report.json
 *
 * Env: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (default claude-haiku-4-5-20251001)
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const TABLE_SIZE = 10;
const TABLES_PER_BATCH = 3;
const CONCURRENCY = 3;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

/* ── helpers ─────────────────────────────────────────────── */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function chatJSON(system, user) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0.7,
        system,
        messages: [{ role: "user", content: user }],
      });
      let text = resp.content[0].text.trim();
      text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
      return JSON.parse(text);
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        console.warn(`  LLM retry ${attempt + 1}/${MAX_RETRIES}: ${e.message}`);
        await sleep(RETRY_DELAY_MS);
      } else {
        throw e;
      }
    }
  }
}

/* ── load lobsters ───────────────────────────────────────── */

const lobstersPath = join(ROOT, "personas", "out", "lobsters.json");
const { lobsters } = JSON.parse(readFileSync(lobstersPath, "utf8"));
const TOTAL = lobsters.length;
console.log(`Loaded ${TOTAL} lobsters from ${lobstersPath}`);

/* ── scoring storage ─────────────────────────────────────── */

const scores = new Array(TOTAL).fill(null).map(() => ({
  totalScore: 0,
  ratingCount: 0,
  matchCount: 0,
  categories: {
    shellGleam: { total: 0, count: 0 },
    clawGame: { total: 0, count: 0 },
    antennaRizz: { total: 0, count: 0 },
    tailFlex: { total: 0, count: 0 },
    butterBath: { total: 0, count: 0 },
  },
}));

const matchPairs = [];

/* ── table simulation ────────────────────────────────────── */

async function simulateTable(tableIndices, tableNum) {
  const tableProfiles = tableIndices.map((i) => ({
    id: i,
    name: lobsters[i].name,
    tagline: lobsters[i].tagline || "",
    bio: lobsters[i].bio || "",
    quirks: lobsters[i].quirks || [],
  }));

  const profileList = tableProfiles
    .map(
      (p) =>
        `[ID ${p.id}] ${p.name} — "${p.tagline}"\n  Bio: ${p.bio}\n  Quirks: ${p.quirks.join(", ")}`
    )
    .join("\n\n");

  const systemPrompt = `You are a dating show judge and narrator for SHELL Mates, a lobster speed-dating event. You must evaluate each lobster's dateability based on their profile. You MUST respond with valid JSON only — no markdown, no explanation.`;

  const userPrompt = `Here are ${tableProfiles.length} lobster contestants at Table #${tableNum} of the SHELL Mates speed-dating event:

${profileList}

After observing their interactions, rate EACH lobster on a 1-10 scale for these categories:
- overall: overall dateability/attractiveness
- shellGleam: how shiny and impressive their shell is
- clawGame: strength and dexterity of their claws
- antennaRizz: charisma and flirting ability
- tailFlex: physical fitness and tail power
- butterBath: how delightful they'd be to share a butter bath with

Also pick the top match pairs (lobsters who would be great together). Pick 1-3 pairs from this table.

Return JSON:
{
  "ratings": [
    {
      "id": <lobster ID number>,
      "name": "<name>",
      "overall": <1-10>,
      "shellGleam": <1-10>,
      "clawGame": <1-10>,
      "antennaRizz": <1-10>,
      "tailFlex": <1-10>,
      "butterBath": <1-10>,
      "comment": "<one-sentence judge's note>"
    }
  ],
  "matches": [
    { "lobster1": <id>, "lobster2": <id>, "chemistry": "<one-sentence why>" }
  ]
}`;

  const result = await chatJSON(systemPrompt, userPrompt);

  for (const r of result.ratings || []) {
    const idx = r.id;
    if (idx < 0 || idx >= TOTAL) continue;
    const s = scores[idx];
    s.totalScore += r.overall || 5;
    s.ratingCount += 1;
    for (const cat of ["shellGleam", "clawGame", "antennaRizz", "tailFlex", "butterBath"]) {
      if (r[cat]) {
        s.categories[cat].total += r[cat];
        s.categories[cat].count += 1;
      }
    }
  }

  for (const m of result.matches || []) {
    matchPairs.push({
      lobster1: m.lobster1,
      lobster2: m.lobster2,
      chemistry: m.chemistry || "",
    });
    if (m.lobster1 >= 0 && m.lobster1 < TOTAL) scores[m.lobster1].matchCount++;
    if (m.lobster2 >= 0 && m.lobster2 < TOTAL) scores[m.lobster2].matchCount++;
  }

  return result;
}

/* ── batch runner ─────────────────────────────────────────── */

async function runBatch(tables) {
  const workers = [];
  let cursor = 0;

  async function next() {
    while (cursor < tables.length) {
      const i = cursor++;
      const { indices, num } = tables[i];
      try {
        await simulateTable(indices, num);
        console.log(`  ✓ Table ${num} (${indices.length} lobsters)`);
      } catch (e) {
        console.error(`  ✗ Table ${num} failed: ${e.message}`);
      }
    }
  }

  for (let w = 0; w < Math.min(CONCURRENCY, tables.length); w++) {
    workers.push(next());
  }
  await Promise.all(workers);
}

/* ── main ─────────────────────────────────────────────────── */

async function main() {
  console.log(`\n🦞 SHELL Mates Dating Simulation`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Table size: ${TABLE_SIZE}`);
  console.log(`   Concurrency: ${CONCURRENCY}`);
  console.log(`   Total lobsters: ${TOTAL}\n`);

  const shuffled = shuffle([...Array(TOTAL).keys()]);

  const allTables = [];
  let tableNum = 1;
  for (let i = 0; i < shuffled.length; i += TABLE_SIZE) {
    const slice = shuffled.slice(i, i + TABLE_SIZE);
    if (slice.length >= 3) {
      allTables.push({ indices: slice, num: tableNum++ });
    }
  }

  console.log(`Created ${allTables.length} tables\n`);

  const totalBatches = Math.ceil(allTables.length / TABLES_PER_BATCH);
  for (let b = 0; b < totalBatches; b++) {
    const batchTables = allTables.slice(b * TABLES_PER_BATCH, (b + 1) * TABLES_PER_BATCH);
    console.log(`Batch ${b + 1}/${totalBatches} (${batchTables.length} tables):`);
    await runBatch(batchTables);

    if (b < totalBatches - 1) {
      await sleep(500);
    }
  }

  /* ── compile results ─────────────────────────────────────── */

  const leaderboard = [];
  for (let i = 0; i < TOTAL; i++) {
    const s = scores[i];
    const avg = s.ratingCount > 0 ? +(s.totalScore / s.ratingCount).toFixed(2) : 5.0;
    const cats = {};
    for (const [cat, v] of Object.entries(s.categories)) {
      cats[cat] = v.count > 0 ? +(v.total / v.count).toFixed(2) : 5.0;
    }
    leaderboard.push({
      agentId: i + 1,
      lobsterIndex: i,
      name: lobsters[i].name,
      overallScore: avg,
      matchCount: s.matchCount,
      ratingCount: s.ratingCount,
      categories: cats,
    });
  }

  leaderboard.sort((a, b) => b.overallScore - a.overallScore || b.matchCount - a.matchCount);

  const report = {
    meta: {
      engine: "MiroFish-inspired SwarmSim (Anthropic Claude)",
      model: MODEL,
      totalAgents: TOTAL,
      tablesRun: allTables.length,
      tableSize: TABLE_SIZE,
      totalMatchPairs: matchPairs.length,
      generatedAt: new Date().toISOString(),
    },
    leaderboard,
    topMatches: matchPairs.slice(0, 50),
    top10: leaderboard.slice(0, 10).map((l) => ({
      rank: leaderboard.indexOf(l) + 1,
      name: l.name,
      score: l.overallScore,
      matches: l.matchCount,
    })),
  };

  const outDir = join(__dirname);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "prediction-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 Report written to ${outPath}`);
  console.log(`   Top 10:`);
  for (const t of report.top10) {
    console.log(`     #${t.rank} ${t.name} — ${t.score}/10 (${t.matches} matches)`);
  }
  console.log(`\n   Total match pairs: ${matchPairs.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
