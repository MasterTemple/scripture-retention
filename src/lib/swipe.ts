import { useEffect, useRef, type TouchEvent as ReactTouchEvent } from "react";

export type SwipeDirection = "left" | "right";

const MIN_DISTANCE = 60;
const MAX_TIME = 700;

/** Text fields keep their own horizontal drags (selecting, moving the caret) */
const ownsDrag = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest("input:not([type=checkbox]), textarea:not([data-swipe]), [data-no-swipe]");

/**
 * Tells a quick, mostly sideways swipe from a scroll or a tap. Returns touch handlers for
 * an element; `useDocumentSwipe` listens on the whole page instead.
 */
export function swipeHandlers(onSwipe: (direction: SwipeDirection) => void) {
  let start: { x: number; y: number; at: number } | null = null;
  return {
    onTouchStart(e: ReactTouchEvent | TouchEvent) {
      const t = e.touches[0];
      start = e.touches.length === 1 && t && !ownsDrag(e.target) ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
    },
    onTouchEnd(e: ReactTouchEvent | TouchEvent) {
      const t = e.changedTouches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const quick = Date.now() - start.at < MAX_TIME;
      start = null;
      if (quick && Math.abs(dx) >= MIN_DISTANCE && Math.abs(dx) > Math.abs(dy) * 2) onSwipe(dx > 0 ? "right" : "left");
    },
  };
}

export function useDocumentSwipe(onSwipe: (direction: SwipeDirection) => void) {
  const latest = useRef(onSwipe);
  latest.current = onSwipe;
  useEffect(() => {
    const handlers = swipeHandlers((d) => latest.current(d));
    const start = (e: TouchEvent) => handlers.onTouchStart(e);
    const end = (e: TouchEvent) => handlers.onTouchEnd(e);
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchend", end);
    };
  }, []);
}
