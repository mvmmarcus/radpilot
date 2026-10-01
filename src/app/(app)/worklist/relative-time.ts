const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 hours ago", "just now", etc, for a study's `studyDate`. */
export function relativeTime(isoDateTime: string, now: Date = new Date()): string {
  const diffSeconds = Math.round((Date.parse(isoDateTime) - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) return "just now";

  for (const [unit, secondsInUnit] of UNITS) {
    if (absSeconds >= secondsInUnit) {
      const value = Math.round(diffSeconds / secondsInUnit);
      return formatter.format(value, unit);
    }
  }
  return formatter.format(Math.round(diffSeconds / 60), "minute");
}
