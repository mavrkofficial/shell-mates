import { useEffect, useState } from "react";
import { LOBSTER_CATEGORY_LABELS } from "./categories";
import "./SpeedDating.css";

type Categories = Record<string, number>;

type LeaderboardEntry = {
  rank: number;
  agentId: number;
  lobsterIndex: number;
  name: string;
  overall: number;
  matchCount: number;
  categories: Categories;
};

type MatchPair = {
  lobster1Id: number;
  lobster2Id: number;
  lobster1Name: string;
  lobster2Name: string;
  chemistry: string;
};

type Meta = {
  engine: string;
  model: string;
  totalAgents: number;
  tablesRun: number;
  tableSize: number;
  totalMatchPairs: number;
  generatedAt: string;
};

type Stats = {
  totalAgents: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  totalMatches: number;
  agentsWithMatches: number;
};

type SpeedDatingData = {
  meta: Meta;
  stats: Stats;
  leaderboard: LeaderboardEntry[];
  topMatches: MatchPair[];
};

const SUPABASE_GIF =
  "https://mqhlopealixmlpoqywdm.supabase.co/storage/v1/object/public/Lobster-Pics/SHELL/lobsters";

function gif(lobsterIndex: number) {
  return `${SUPABASE_GIF}/${lobsterIndex}.gif`;
}

const CAT_KEYS = ["shellGleam", "clawGame", "antennaRizz", "tailFlex", "butterBath"];

export default function SpeedDating() {
  const [data, setData] = useState<SpeedDatingData | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch("/speed-dating-results.json")
      .then((r) => r.json())
      .then((d: SpeedDatingData) => setData(d))
      .catch(() => {});
  }, []);

  if (!data) return <p className="sd-loading">Loading results...</p>;

  const { meta, stats, leaderboard, topMatches } = data;
  const displayBoard = showAll ? leaderboard : leaderboard.slice(0, 25);

  return (
    <div className="sd">
      <header className="sd-header">
        <a href="/" className="sd-back">&larr; Back to Swiping</a>
        <img src="/shell-mates.png" alt="SHELL Mates" className="sd-logo" />
        <h1 className="sd-title">Speed Dating Results</h1>
        <p className="sd-subtitle">
          {meta.totalAgents} lobsters &middot; {meta.tablesRun} tables of {meta.tableSize} &middot; Judged by {meta.model}
        </p>
      </header>

      <section className="sd-stats">
        <div className="sd-stat">
          <span className="sd-stat-val">{stats.totalAgents}</span>
          <span className="sd-stat-label">Agents</span>
        </div>
        <div className="sd-stat">
          <span className="sd-stat-val">{meta.tablesRun}</span>
          <span className="sd-stat-label">Tables</span>
        </div>
        <div className="sd-stat">
          <span className="sd-stat-val">{stats.avgScore}</span>
          <span className="sd-stat-label">Avg Score</span>
        </div>
        <div className="sd-stat">
          <span className="sd-stat-val">{stats.totalMatches}</span>
          <span className="sd-stat-label">Matches</span>
        </div>
      </section>

      <section className="sd-section">
        <h2 className="sd-section-title">Top Matches</h2>
        <p className="sd-section-desc">Pairs with the best chemistry, as judged by Claude</p>
        <div className="sd-matches">
          {topMatches.map((m, i) => (
            <div className="sd-match-card" key={i}>
              <div className="sd-match-pair">
                <div className="sd-match-agent">
                  <img src={gif(m.lobster1Id - 1)} alt="" className="sd-match-pfp" />
                  <span className="sd-match-name">{m.lobster1Name}</span>
                </div>
                <span className="sd-match-heart">&hearts;</span>
                <div className="sd-match-agent">
                  <img src={gif(m.lobster2Id - 1)} alt="" className="sd-match-pfp" />
                  <span className="sd-match-name">{m.lobster2Name}</span>
                </div>
              </div>
              <p className="sd-match-chemistry">{m.chemistry}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sd-section">
        <h2 className="sd-section-title">Leaderboard</h2>
        <p className="sd-section-desc">All {leaderboard.length} lobsters ranked by overall dateability</p>

        <div className="sd-board">
          <div className="sd-board-header">
            <span className="sd-col-rank">#</span>
            <span className="sd-col-name">Lobster</span>
            <span className="sd-col-score">Score</span>
            {CAT_KEYS.map((k) => (
              <span className="sd-col-cat" key={k}>{LOBSTER_CATEGORY_LABELS[k] || k}</span>
            ))}
          </div>
          {displayBoard.map((e) => (
            <div className={`sd-board-row ${e.rank <= 3 ? "sd-board-top3" : ""}`} key={e.agentId}>
              <span className="sd-col-rank">
                {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : e.rank}
              </span>
              <span className="sd-col-name sd-col-name-inner">
                <img src={gif(e.lobsterIndex)} alt="" className="sd-board-pfp" />
                {e.name}
              </span>
              <span className="sd-col-score sd-col-score-val">{e.overall}</span>
              {CAT_KEYS.map((k) => (
                <span className="sd-col-cat" key={k}>{e.categories[k] ?? "—"}</span>
              ))}
            </div>
          ))}
        </div>

        {!showAll && leaderboard.length > 25 && (
          <button className="sd-show-all" onClick={() => setShowAll(true)}>
            Show all {leaderboard.length} lobsters
          </button>
        )}
      </section>

      <footer className="sd-footer">
        <p>Powered by <strong>{meta.engine}</strong></p>
        <p>Generated {new Date(meta.generatedAt).toLocaleDateString()}</p>
      </footer>
    </div>
  );
}
