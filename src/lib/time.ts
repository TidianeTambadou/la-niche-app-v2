/**
 * Tiny relative-time formatter using the platform Intl API. Pure function,
 * works server-or client-side. Output examples : "il y a 2 min", "il y a 3 j",
 * "il y a 1 mois". Falls back to the absolute date past 30 days.
 */

const RTF = new Intl.RelativeTimeFormat("fr", { numeric: "auto", style: "short" });

export function timeAgo(input: string | Date, now: Date = new Date()): string {
  const then = typeof input === "string" ? new Date(input) : input;
  const diffMs = then.getTime() - now.getTime();
  const sec = Math.round(diffMs / 1000);
  const abs = Math.abs(sec);

  if (abs < 60) return RTF.format(sec, "second");
  if (abs < 3600) return RTF.format(Math.round(sec / 60), "minute");
  if (abs < 86_400) return RTF.format(Math.round(sec / 3600), "hour");
  if (abs < 30 * 86_400) return RTF.format(Math.round(sec / 86_400), "day");

  return new Intl.DateTimeFormat("fr", { day: "numeric", month: "short", year: "numeric" }).format(
    then,
  );
}

export function isoDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toISOString().slice(0, 10);
}
