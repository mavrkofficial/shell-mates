import { useCallback, useRef, useState } from "react";
import "./SwipeCardStack.css";

const SWIPE_THRESHOLD = 96;
const ROTATION_FACTOR = 0.06;

export type SwipeCardModel = {
  id: number;
  name: string;
  image: string;
  description: string;
  overall10?: string;
  categoryLines: { tag: string; label: string; line: string }[];
};

type Props = {
  stackIds: number[];
  cardsById: Map<number, SwipeCardModel>;
  onSwipeComplete: (direction: "left" | "right", cardId: number) => void;
  onRewind: () => void;
  canRewind: boolean;
};

export function SwipeCardStack({ stackIds, cardsById, onSwipeComplete, onRewind, canRewind }: Props) {
  const topId = stackIds[stackIds.length - 1];
  const visible = stackIds.slice(-3);

  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exit, setExit] = useState<"left" | "right" | null>(null);
  const exitDirRef = useRef<"left" | "right" | null>(null);

  const start = useRef({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);

  const resetDrag = useCallback(() => {
    setDrag({ x: 0, y: 0 });
    setDragging(false);
    pointerId.current = null;
  }, []);

  const finishExit = useCallback(() => {
    const dir = exitDirRef.current;
    exitDirRef.current = null;
    setExit(null);
    resetDrag();
    if (dir && topId !== undefined) onSwipeComplete(dir, topId);
  }, [onSwipeComplete, resetDrag, topId]);

  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "transform") return;
      if (e.target !== e.currentTarget) return;
      if (!exitDirRef.current) return;
      finishExit();
    },
    [finishExit],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (exit || topId === undefined) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerId.current = e.pointerId;
    start.current = { x: e.clientX - drag.x, y: e.clientY - drag.y };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || exit || pointerId.current !== e.pointerId) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    setDrag({ x, y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging || exit) return;
    if (pointerId.current !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (drag.x > SWIPE_THRESHOLD) {
      exitDirRef.current = "right";
      setExit("right");
    } else if (drag.x < -SWIPE_THRESHOLD) {
      exitDirRef.current = "left";
      setExit("left");
    } else {
      resetDrag();
    }
    setDragging(false);
  };

  const triggerButton = (dir: "left" | "right") => {
    if (exit || topId === undefined) return;
    exitDirRef.current = dir;
    setExit(dir);
  };

  const nopeOpacity = Math.min(1, Math.max(0, -drag.x / (SWIPE_THRESHOLD * 1.25)));
  const likeOpacity = Math.min(1, Math.max(0, drag.x / (SWIPE_THRESHOLD * 1.25)));
  const rotate = dragging || !exit ? drag.x * ROTATION_FACTOR : 0;

  const topTransform =
    exit === "right"
      ? "translateX(125vw) rotate(28deg)"
      : exit === "left"
        ? "translateX(-125vw) rotate(-28deg)"
        : `translate(${drag.x}px, ${drag.y}px) rotate(${rotate}deg)`;

  const topTransition =
    exit && !dragging
      ? "transform 0.42s cubic-bezier(0.25, 0.8, 0.25, 1)"
      : dragging
        ? "none"
        : "transform 0.22s cubic-bezier(0.34, 1.3, 0.64, 1)";

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="swipe-root">
      <div className="swipe-stack">
        {visible.map((id, i) => {
          const depth = visible.length - 1 - i;
          const card = cardsById.get(id);
          if (!card) return null;
          const isTop = depth === 0;

          if (!isTop) {
            const s = 0.88 + depth * 0.06;
            const y = (2 - depth) * 10;
            return (
              <div
                key={id}
                className="swipe-card swipe-card--under"
                style={{
                  transform: `scale(${s}) translateY(${y}px)`,
                  zIndex: depth + 1,
                }}
                aria-hidden
              >
                <CardFace card={card} compact />
              </div>
            );
          }

          return (
            <div
              key={id}
              className="swipe-card swipe-card--top"
              style={{
                transform: topTransform,
                transition: topTransition,
                zIndex: 10,
                touchAction: "none",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onTransitionEnd={handleTransitionEnd}
            >
              <div
                className="swipe-stamp swipe-stamp--nope"
                style={{ opacity: exit === "left" ? 1 : nopeOpacity }}
              >
                NOPE
              </div>
              <div
                className="swipe-stamp swipe-stamp--like"
                style={{ opacity: exit === "right" ? 1 : likeOpacity }}
              >
                PINCH
              </div>
              <CardFace card={card} compact={false} />
            </div>
          );
        })}
      </div>

      <div className="swipe-actions">
        <button
          type="button"
          className="swipe-btn swipe-btn--rewind"
          aria-label="Undo last swipe"
          disabled={exit !== null || !canRewind}
          onClick={onRewind}
        />
        <button
          type="button"
          className="swipe-btn swipe-btn--pass"
          aria-label="Pass"
          disabled={exit !== null || topId === undefined}
          onClick={() => triggerButton("left")}
        />
        <button
          type="button"
          className="swipe-btn swipe-btn--like"
          aria-label="Pinch"
          disabled={exit !== null || topId === undefined}
          onClick={() => triggerButton("right")}
        />
      </div>
    </div>
  );
}

function CardFace({ card, compact }: { card: SwipeCardModel; compact: boolean }) {
  const [tagline, ...bioLines] = (card.description || "").split("\n\n");
  const bio = bioLines.join("\n\n");

  return (
    <div className={`swipe-face ${compact ? "swipe-face--compact" : ""}`}>
      <div className="swipe-img-wrap">
        <img src={card.image} alt="" draggable={false} />
        <div className="swipe-img-scrim" aria-hidden />
        <div className="swipe-img-overlay">
          <h2 className="swipe-name">
            {card.name}
            {card.overall10 && (
              <span className="swipe-score-badge">{card.overall10}</span>
            )}
          </h2>
          {tagline && <p className="swipe-tagline">{tagline}</p>}
        </div>
      </div>
      {!compact && bio && <p className="swipe-bio">{bio}</p>}
      {!compact && card.categoryLines.length > 0 && (
        <div className="swipe-categories">
          {card.categoryLines.map((cat) => {
            const score = parseFloat(cat.line);
            const pct = Math.min(100, Math.max(0, (score / 10) * 100));
            return (
              <div key={cat.tag} className="swipe-cat-row">
                <span className="swipe-cat-label">{cat.label}</span>
                <div className="swipe-cat-bar-bg">
                  <div
                    className="swipe-cat-bar-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="swipe-cat-value">{cat.line}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
