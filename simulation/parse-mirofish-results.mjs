/**
 * Parse simulation/prediction-report.json into simulation/mirofish-results.json.
 *
 * The output file is the canonical "scored" dataset that:
 *   1. Gets committed to the repo for the hackathon submission
 *   2. Feeds into scripts/write-mirofish-reputation.ts for on-chain feedback
 *
 * Each entry maps to one giveFeedback(agentId, value, 0, "hotOrNot", ...) call.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const reportPath = join(__dirname, "prediction-report.json");
const report = JSON.parse(readFileSync(reportPath, "utf8"));

const { leaderboard, topMatches, meta } = report;

const results = {
  meta: {
    ...meta,
    parsedAt: new Date().toISOString(),
    description:
      "MiroFish-inspired dating simulation results for 1000 SHELL Mates lobster agents. " +
      "Each agent was rated by an AI swarm across multiple speed-dating tables. " +
      "Scores are 1-10 (mapped to int128 on-chain). Categories: hotOrNot (overall), " +
      "shellGleam, clawGame, antennaRizz, tailFlex, butterBath.",
  },

  feedbackEntries: leaderboard.map((entry) => ({
    agentId: entry.agentId,
    lobsterIndex: entry.lobsterIndex,
    name: entry.name,
    overallScore: entry.overallScore,
    matchCount: entry.matchCount,
    ratingCount: entry.ratingCount,
    categories: entry.categories,
    onChainValue: Math.round(entry.overallScore * 10),
    onChainDecimals: 1,
    tag1: "hotOrNot",
  })),

  categoryFeedback: leaderboard.flatMap((entry) =>
    Object.entries(entry.categories).map(([cat, score]) => ({
      agentId: entry.agentId,
      name: entry.name,
      category: cat,
      score,
      onChainValue: Math.round(score * 10),
      onChainDecimals: 1,
      tag1: cat,
    }))
  ),

  topMatches: topMatches.map((m) => ({
    lobster1Id: m.lobster1 + 1,
    lobster2Id: m.lobster2 + 1,
    lobster1Name: leaderboard.find((l) => l.lobsterIndex === m.lobster1)?.name || `Lobster #${m.lobster1}`,
    lobster2Name: leaderboard.find((l) => l.lobsterIndex === m.lobster2)?.name || `Lobster #${m.lobster2}`,
    chemistry: m.chemistry,
  })),

  leaderboardTop25: leaderboard.slice(0, 25).map((e, i) => ({
    rank: i + 1,
    agentId: e.agentId,
    name: e.name,
    overallScore: e.overallScore,
    matchCount: e.matchCount,
    categories: e.categories,
  })),

  stats: {
    totalAgents: leaderboard.length,
    avgScore: +(leaderboard.reduce((s, e) => s + e.overallScore, 0) / leaderboard.length).toFixed(2),
    maxScore: Math.max(...leaderboard.map((e) => e.overallScore)),
    minScore: Math.min(...leaderboard.map((e) => e.overallScore)),
    totalMatches: topMatches.length,
    agentsWithMatches: new Set([...topMatches.map((m) => m.lobster1), ...topMatches.map((m) => m.lobster2)]).size,
  },
};

const outPath = join(__dirname, "mirofish-results.json");
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`  ${results.feedbackEntries.length} overall feedback entries`);
console.log(`  ${results.categoryFeedback.length} category feedback entries`);
console.log(`  ${results.topMatches.length} match pairs`);
console.log(`  Avg score: ${results.stats.avgScore}`);
console.log(`  Score range: ${results.stats.minScore} - ${results.stats.maxScore}`);
