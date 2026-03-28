import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { SwipeCardStack, type SwipeCardModel } from "./components/SwipeCardStack";
import { LOBSTER_CATEGORY_LABELS } from "./categories";
import "./App.css";

type Registration = {
  type: string;
  name: string;
  description: string;
  image: string;
};

type Card = {
  id: number;
  reg: Registration;
  overall10?: string;
  categoryLines: { tag: string; label: string; line: string }[];
};

type SwipeState = {
  stack: number[];
  matches: number[];
  past: { stack: number[]; matches: number[] }[];
};

type SwipeAction =
  | { type: "HYDRATE"; stack: number[] }
  | { type: "SWIPE"; direction: "left" | "right" }
  | { type: "UNDO" };

function swipeReducer(state: SwipeState, action: SwipeAction): SwipeState {
  switch (action.type) {
    case "HYDRATE":
      return { stack: action.stack, matches: [], past: [] };
    case "SWIPE": {
      const top = state.stack[state.stack.length - 1];
      if (top === undefined) return state;
      return {
        past: [...state.past, { stack: state.stack, matches: state.matches }],
        stack: state.stack.slice(0, -1),
        matches: action.direction === "right" ? [...state.matches, top] : state.matches,
      };
    }
    case "UNDO": {
      const last = state.past[state.past.length - 1];
      if (!last) return state;
      return {
        past: state.past.slice(0, -1),
        stack: last.stack,
        matches: last.matches,
      };
    }
    default:
      return state;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SUPABASE_BASE =
  "https://mqhlopealixmlpoqywdm.supabase.co/storage/v1/object/public/Lobster-Pics/SHELL/registrations";

const FETCH_CONCURRENCY = 40;

async function fetchAllRegistrations(count: number): Promise<Card[]> {
  const results: Card[] = new Array(count);
  let cursor = 0;

  async function next() {
    while (cursor < count) {
      const i = cursor++;
      const r = await fetch(`${SUPABASE_BASE}/${i}.json`);
      if (!r.ok) continue;
      const reg = (await r.json()) as Registration;
      results[i] = { id: i, reg, categoryLines: [] };
    }
  }

  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, count) }, () => next());
  await Promise.all(workers);
  return results.filter(Boolean);
}

const PRELOAD_AHEAD = 5;
function preloadImages(stackIds: number[], cardsById: Map<number, SwipeCardModel>) {
  const upcoming = stackIds.slice(-PRELOAD_AHEAD);
  for (const id of upcoming) {
    const card = cardsById.get(id);
    if (!card) continue;
    const link = document.querySelector(`link[href="${card.image}"]`);
    if (!link) {
      const el = document.createElement("link");
      el.rel = "preload";
      el.as = "image";
      el.href = card.image;
      document.head.appendChild(el);
    }
  }
}

export default function App() {
  const count = Math.max(1, parseInt(import.meta.env.VITE_LOBSTER_COUNT || "1", 10));

  const [cards, setCards] = useState<Card[]>([]);
  const [swipe, dispatchSwipe] = useReducer(swipeReducer, {
    stack: [] as number[],
    matches: [] as number[],
    past: [] as { stack: number[]; matches: number[] }[],
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [matchOverlay, setMatchOverlay] = useState<{ name: string; image: string } | null>(null);

  type ScoreData = Record<string, { overall: number; cats: Record<string, number> }>;
  const [repScores, setRepScores] = useState<ScoreData>({});

  useEffect(() => {
    fetch("/reputation-scores.json")
      .then((r) => r.ok ? r.json() : {})
      .then((data: ScoreData) => setRepScores(data))
      .catch(() => {});
  }, []);

  const cardsById = useMemo(() => {
    const m = new Map<number, SwipeCardModel>();
    for (const c of cards) {
      const agentId = String(c.id + 1);
      const rep = repScores[agentId];
      const categoryLines: Card["categoryLines"] = [];

      if (rep?.cats) {
        for (const [tag, score] of Object.entries(rep.cats)) {
          categoryLines.push({
            tag,
            label: LOBSTER_CATEGORY_LABELS[tag] || tag,
            line: `${score.toFixed(1)}/10`,
          });
        }
      }

      m.set(c.id, {
        id: c.id,
        name: c.reg.name,
        image: c.reg.image,
        description: c.reg.description,
        overall10: rep ? rep.overall.toFixed(1) : c.overall10,
        categoryLines: categoryLines.length ? categoryLines : c.categoryLines,
      });
    }
    return m;
  }, [cards, repScores]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const out = await fetchAllRegistrations(count);
      setCards(out);
      dispatchSwipe({ type: "HYDRATE", stack: shuffle(out.map((x) => x.id)) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [count]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (swipe.stack.length > 0) preloadImages(swipe.stack, cardsById);
  }, [swipe.stack, cardsById]);

  const onSwipeComplete = useCallback(
    (direction: "left" | "right", cardId: number) => {
      dispatchSwipe({ type: "SWIPE", direction });
      if (direction === "right") {
        const card = cardsById.get(cardId);
        setMatchOverlay({
          name: card?.name ?? "Lobster",
          image: card?.image ?? "",
        });
      }
    },
    [cardsById],
  );

  const onRewind = useCallback(() => {
    dispatchSwipe({ type: "UNDO" });
  }, []);

  const hasCards = swipe.stack.length > 0;

  return (
    <div className="app">
      <header className="hdr">
        <img src="/shell-mates.png" alt="SHELL Mates" className="hdr-logo" />
      </header>

      {loading && <p className="center">Loading…</p>}
      {err && <p className="err">{err}</p>}

      {!loading && !err && hasCards && (
        <SwipeCardStack
          stackIds={swipe.stack}
          cardsById={cardsById}
          onSwipeComplete={onSwipeComplete}
          onRewind={onRewind}
          canRewind={swipe.past.length > 0}
        />
      )}

      {!loading && !err && !hasCards && cards.length > 0 && (
        <div className="deck-empty">
          <p className="deck-empty-title">End of the deck</p>
          <p className="deck-empty-sub">
            <strong>{swipe.matches.length}</strong> saved · tap rewind to go back
          </p>
        </div>
      )}

      {matchOverlay && (
        <div className="match-overlay" onClick={() => setMatchOverlay(null)}>
          <div className="match-content">
            <h2 className="match-title">It's a Match!</h2>
            {matchOverlay.image && (
              <img className="match-pfp" src={matchOverlay.image} alt="" />
            )}
            <p className="match-name">{matchOverlay.name}</p>
            <button
              type="button"
              className="match-dismiss"
              onClick={() => setMatchOverlay(null)}
            >
              Keep Swiping
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
