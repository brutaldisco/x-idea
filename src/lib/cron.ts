/** 5-field cron (min hour dom month dow). Star, dash-1, or star-slash-n steps. */

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function fieldMatches(
  expr: string,
  value: number,
  min: number,
  max: number,
): boolean {
  if (expr === "*" || expr === "-1") {
    return true;
  }
  const step = expr.match(/^\*\/(\d+)$/);
  if (step) {
    const n = Number(step[1]);
    return n > 0 && value % n === 0;
  }
  if (expr.includes(",")) {
    return expr.split(",").some((part) => fieldMatches(part, value, min, max));
  }
  const range = expr.match(/^(\d+)-(\d+)$/);
  if (range) {
    return value >= Number(range[1]) && value <= Number(range[2]);
  }
  const n = Number(expr);
  return Number.isFinite(n) && n >= min && n <= max && n === value;
}

export type ZonedParts = {
  minute: number;
  hour: number;
  day: number;
  month: number;
  dow: number;
};

export function zonedParts(at: Date, timeZone = "UTC"): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    minute: "numeric",
    hour: "numeric",
    day: "numeric",
    month: "numeric",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);

  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  const weekday = pick("weekday").slice(0, 3).toLowerCase();

  return {
    minute: Number(pick("minute")),
    hour: Number(pick("hour")),
    day: Number(pick("day")),
    month: Number(pick("month")),
    dow: WEEKDAYS[weekday] ?? 0,
  };
}

export function cronDue(cronExpr: string, at: Date, timeZone = "UTC"): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }
  const [minute, hour, dom, month, dow] = fields;
  const zoned = zonedParts(at, timeZone);
  return (
    fieldMatches(minute, zoned.minute, 0, 59) &&
    fieldMatches(hour, zoned.hour, 0, 23) &&
    fieldMatches(dom, zoned.day, 1, 31) &&
    fieldMatches(month, zoned.month, 1, 12) &&
    fieldMatches(dow, zoned.dow, 0, 6)
  );
}

export function nextRunAfter(
  cronExpr: string,
  from: Date,
  timeZone = "UTC",
): Date {
  const cursor = new Date(from.getTime() + 60_000);
  cursor.setUTCSeconds(0, 0);
  for (let i = 0; i < 60 * 24 * 14; i += 1) {
    if (cronDue(cronExpr, cursor, timeZone)) {
      return cursor;
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}
