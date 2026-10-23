/** A row from the API: how many installs reported `value` in `week`. */
export type WeeklyCount = { week: string; value: string; installs: number };

const dayMs = 24 * 60 * 60 * 1000;

/** The Monday (UTC) starting the week `date` is in, as `YYYY-MM-DD`. */
export function weekStart(date: Date) {
  const day = new Date(`${date.toISOString().slice(0, 10)}T00:00:00Z`);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * dayMs)
    .toISOString()
    .slice(0, 10);
}

/**
 * The weeks to show, oldest first: the complete ones (the current week is
 * still filling up), or just the current one if that's all there is.
 */
export function shownWeeks(rows: WeeklyCount[], now: Date) {
  const all = [...new Set(rows.map((r) => r.week))].sort();
  const current = weekStart(now);
  const complete = all.filter((week) => week < current);
  return complete.length > 0 ? complete : all;
}

/** Compare version strings by their numeric parts: "10.130" > "10.99". */
export function compareVersions(a: string, b: string) {
  const pa = a
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  const pb = b
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

export const otherLabel = "Other";

export type ShareSeries = {
  /** Series names, in colour-slot order; "Other" (if any) last. */
  series: string[];
  weeks: {
    week: string;
    total: number;
    values: Record<string, number>;
  }[];
};

/**
 * Values over time as at most `maxSeries` named series, with the rest folded
 * into "Other". The series are chosen from `selectFrom` (the latest week of
 * all the data, not just the weeks shown), so changing the time range never
 * repaints them.
 */
export function shareSeries(
  rows: WeeklyCount[],
  weeks: string[],
  {
    maxSeries = 7,
    group = (value: string) => value,
    order = (a: string, b: string) => compareVersions(b, a),
    selectFrom,
  }: {
    maxSeries?: number;
    group?: (value: string) => string;
    order?: (a: string, b: string) => number;
    selectFrom: string;
  },
): ShareSeries {
  const grouped = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const name = group(row.value);
    const byWeek = grouped.get(row.week) ?? new Map<string, number>();
    byWeek.set(name, (byWeek.get(name) ?? 0) + row.installs);
    grouped.set(row.week, byWeek);
  }
  const ranked = [...(grouped.get(selectFrom) ?? new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const named = ranked.slice(0, maxSeries).sort(order);
  const namedSet = new Set(named);
  let hasOther = false;
  const weekValues = weeks.map((week) => {
    const values: Record<string, number> = {};
    let total = 0;
    for (const [name, installs] of grouped.get(week) ?? []) {
      const key = namedSet.has(name) ? name : otherLabel;
      if (key === otherLabel) hasOther = true;
      values[key] = (values[key] ?? 0) + installs;
      total += installs;
    }
    return { week, total, values };
  });
  return {
    series: hasOther ? [...named, otherLabel] : named,
    weeks: weekValues,
  };
}

/** One week's values, most installs first (or in `order`, if given). */
export function breakdown(
  rows: WeeklyCount[],
  week: string,
  order?: (a: string, b: string) => number,
) {
  const items = rows
    .filter((r) => r.week === week)
    .map(({ value, installs }) => ({ value, installs }));
  return order
    ? items.sort((a, b) => order(a.value, b.value))
    : items.sort(
        (a, b) => b.installs - a.installs || a.value.localeCompare(b.value),
      );
}

/** The order of the user count buckets (see the ingest roll-up). */
export const userCountBuckets = ["1", "2–3", "4–6", "7–10", "11+"];

export function bucketOrder(a: string, b: string) {
  return userCountBuckets.indexOf(a) - userCountBuckets.indexOf(b);
}

/** "14.367" → "v14". */
export function foundryGeneration(version: string) {
  return `v${version.split(".")[0]}`;
}

/** 1284 → "1,284"; 12_900 → "12.9K". */
export function formatCount(n: number) {
  if (n < 10_000) return n.toLocaleString("en");
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatPercent(part: number, whole: number) {
  if (whole === 0) return "–";
  const pct = (part / whole) * 100;
  return `${pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/** "2026-10-19" → "19 Oct" (or "19 Oct 2026" with `year`). */
export function formatWeek(week: string, year = false) {
  return new Date(`${week}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}
