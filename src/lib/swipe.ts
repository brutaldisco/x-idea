export type SwipeIntent = "confirm" | "archive" | "snooze";
export type SwipeAxis = "x" | "y";

export const SWIPE_THRESHOLD = 80;
export const SWIPE_LOCK = 8;

export function swipeAxis(
  dx: number,
  dy: number,
  lock = SWIPE_LOCK,
): SwipeAxis | null {
  if (Math.abs(dx) < lock && Math.abs(dy) < lock) {
    return null;
  }
  return Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
}

export function swipeOffset(
  dx: number,
  dy: number,
  axis: SwipeAxis | null,
): { x: number; y: number } {
  if (axis === "x") {
    return { x: dx, y: 0 };
  }
  if (axis === "y") {
    return { x: 0, y: Math.min(0, dy) };
  }
  return { x: 0, y: 0 };
}

export function resolveSwipeIntent(
  dx: number,
  dy: number,
  threshold = SWIPE_THRESHOLD,
): SwipeIntent | null {
  if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= threshold) {
    return dx > 0 ? "confirm" : "archive";
  }
  if (dy <= -threshold && Math.abs(dy) > Math.abs(dx)) {
    return "snooze";
  }
  return null;
}

export function swipeHint(
  dx: number,
  dy: number,
  axis: SwipeAxis | null,
  threshold = SWIPE_THRESHOLD,
): { intent: SwipeIntent | null; progress: number } {
  if (axis === "x" && dx !== 0) {
    return {
      intent: dx > 0 ? "confirm" : "archive",
      progress: Math.min(1, Math.abs(dx) / threshold),
    };
  }
  if (axis === "y" && dy < 0) {
    return {
      intent: "snooze",
      progress: Math.min(1, Math.abs(dy) / threshold),
    };
  }
  return { intent: null, progress: 0 };
}
