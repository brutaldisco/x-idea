export const PACIFIC_TZ = "America/Los_Angeles";

export function dateKeyInZone(at = new Date(), timeZone = PACIFIC_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function pacificDay(at = new Date()): string {
  return dateKeyInZone(at, PACIFIC_TZ);
}

export function nextMidnightInZone(
  now = new Date(),
  timeZone = PACIFIC_TZ,
): Date {
  const today = dateKeyInZone(now, timeZone);
  let lo = now.getTime();
  let hi = now.getTime() + 36 * 60 * 60 * 1000;
  if (dateKeyInZone(new Date(hi), timeZone) === today) {
    hi += 12 * 60 * 60 * 1000;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dateKeyInZone(new Date(mid), timeZone) === today) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return new Date(hi);
}

export function nextMidnightPacific(now = new Date()): Date {
  return nextMidnightInZone(now, PACIFIC_TZ);
}

export function toSqliteUtc(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export function formatCardDate(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, 10);
  }
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}
