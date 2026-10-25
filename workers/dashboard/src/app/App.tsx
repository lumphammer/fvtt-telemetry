import { useEffect, useState } from "react";

import { ChartCard } from "./chartParts.tsx";
import { BarList, LineChart, StackedColumns, StatTile } from "./charts.tsx";
import {
  breakdown,
  bucketOrder,
  formatCount,
  formatPercent,
  formatWeek,
  foundryGeneration,
  shareSeries,
  shownWeeks,
  type ShareSeries,
  type WeeklyCount,
} from "./data.ts";

/** How far back we fetch; the range filter slices it. */
const fetchWeeks = 104;

const ranges = [
  { label: "12 weeks", weeks: 12 },
  { label: "6 months", weeks: 26 },
  { label: "1 year", weeks: 52 },
  { label: "2 years", weeks: 104 },
];

const fixedDimensions = [
  "installs",
  "packageVersion",
  "foundryVersion",
  "language",
  "country",
  "userCount",
  "module",
] as const;

type PackageData = Record<string, WeeklyCount[]>;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

async function loadPackage(packageId: string): Promise<PackageData> {
  const base = `/api/${encodeURIComponent(packageId)}`;
  const dimensions = await getJson<string[]>(`${base}/dimensions`);
  const wanted = [
    ...fixedDimensions,
    ...dimensions.filter((d) => d.startsWith("setting:")),
  ];
  const series = await Promise.all(
    wanted.map((dimension) =>
      getJson<WeeklyCount[]>(
        `${base}/series?dimension=${encodeURIComponent(dimension)}&weeks=${fetchWeeks}`,
      ),
    ),
  );
  return Object.fromEntries(wanted.map((d, i) => [d, series[i] ?? []]));
}

function CountTable({
  rows,
  total,
  label,
}: {
  rows: { value: string; installs: number }[];
  total: number;
  label: string;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>{label}</th>
          <th className="num">Installs</th>
          <th className="num">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.value}>
            <td>{r.value || "(none)"}</td>
            <td className="num">{formatCount(r.installs)}</td>
            <td className="num">{formatPercent(r.installs, total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ShareTable({ data }: { data: ShareSeries }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Week</th>
          {data.series.map((s) => (
            <th className="num" key={s}>
              {s}
            </th>
          ))}
          <th className="num">Installs</th>
        </tr>
      </thead>
      <tbody>
        {[...data.weeks].reverse().map((w) => (
          <tr key={w.week}>
            <td>{formatWeek(w.week, true)}</td>
            {data.series.map((s) => (
              <td className="num" key={s}>
                {formatPercent(w.values[s] ?? 0, w.total)}
              </td>
            ))}
            <td className="num">{formatCount(w.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BreakdownCard({
  title,
  subtitle,
  rows,
  total,
  label,
}: {
  title: string;
  subtitle: string;
  rows: { value: string; installs: number }[];
  total: number;
  label: string;
}) {
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      chart={<BarList items={rows} total={total} />}
      table={<CountTable rows={rows} total={total} label={label} />}
    />
  );
}

function Dashboard({ data, range }: { data: PackageData; range: number }) {
  const installs = data["installs"] ?? [];
  const allWeeks = shownWeeks(installs, new Date());
  const weeks = allWeeks.slice(-range);
  const latest = allWeeks.at(-1);
  if (latest === undefined) {
    return <div className="empty">No reports yet.</div>;
  }
  const totalFor = (week: string) =>
    installs.find((r) => r.week === week)?.installs ?? 0;
  const total = totalFor(latest);
  const weekNote = `Week of ${formatWeek(latest, true)}`;

  const points = weeks.map((week) => ({ week, value: totalFor(week) }));
  const fourBack = allWeeks.at(-5);
  const change = fourBack === undefined ? null : total - totalFor(fourBack);

  const versions = shareSeries(data["packageVersion"] ?? [], weeks, {
    selectFrom: latest,
  });
  const foundry = shareSeries(data["foundryVersion"] ?? [], weeks, {
    selectFrom: latest,
    group: foundryGeneration,
  });
  const newest = versions.series[0];
  const newestShare =
    newest === undefined ? 0 : (versions.weeks.at(-1)?.values[newest] ?? 0);

  const settings = Object.keys(data)
    .filter((d) => d.startsWith("setting:"))
    .sort();

  return (
    <>
      <section className="tiles">
        <StatTile
          label="Active installs"
          value={formatCount(total)}
          delta={
            change === null
              ? undefined
              : {
                  text: `${change >= 0 ? "+" : ""}${formatCount(change)}`,
                  direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
                  period: "vs 4 weeks earlier",
                }
          }
          trend={allWeeks.slice(-12).map(totalFor)}
        />
        <StatTile
          label={
            newest
              ? `On the newest version (${newest})`
              : "On the newest version"
          }
          value={formatPercent(newestShare, total)}
        />
      </section>
      <section className="grid">
        <ChartCard
          wide
          title="Active installs"
          subtitle="Installs that reported at least once in the week"
          chart={<LineChart points={points} label="Active installs" />}
          table={
            <CountTable
              rows={[...points].reverse().map((p) => ({
                value: formatWeek(p.week, true),
                installs: p.value,
              }))}
              total={0}
              label="Week"
            />
          }
        />
        <ChartCard
          title="Versions"
          subtitle="Share of active installs"
          chart={<StackedColumns data={versions} />}
          table={<ShareTable data={versions} />}
        />
        <ChartCard
          title="Foundry versions"
          subtitle="Share of active installs"
          chart={<StackedColumns data={foundry} />}
          table={<ShareTable data={foundry} />}
        />
        {settings.map((dimension) => {
          const name = dimension.slice("setting:".length);
          return (
            <BreakdownCard
              key={dimension}
              title={`Setting: ${name}`}
              subtitle={weekNote}
              rows={breakdown(data[dimension] ?? [], latest)}
              total={total}
              label={name}
            />
          );
        })}
        <BreakdownCard
          title="Languages"
          subtitle={weekNote}
          rows={breakdown(data["language"] ?? [], latest)}
          total={total}
          label="Language"
        />
        <BreakdownCard
          title="Countries"
          subtitle={weekNote}
          rows={breakdown(data["country"] ?? [], latest)}
          total={total}
          label="Country"
        />
        <BreakdownCard
          title="Users per world"
          subtitle={weekNote}
          rows={breakdown(data["userCount"] ?? [], latest, bucketOrder)}
          total={total}
          label="Users"
        />
        <BreakdownCard
          title="Modules"
          subtitle={weekNote}
          rows={breakdown(data["module"] ?? [], latest)}
          total={total}
          label="Module"
        />
      </section>
    </>
  );
}

export function App() {
  const [packages, setPackages] = useState<string[] | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [range, setRange] = useState(26);
  const [data, setData] = useState<PackageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<string[]>("/api/packages")
      .then((list) => {
        setPackages(list);
        setPackageId(
          list.includes("investigator") ? "investigator" : (list[0] ?? null),
        );
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (packageId === null) return;
    let cancelled = false;
    setLoading(true);
    loadPackage(packageId)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [packageId]);

  return (
    <main>
      <h1>Usage stats</h1>
      <div className="filters">
        <label>
          Package
          <select
            value={packageId ?? ""}
            onChange={(e) => setPackageId(e.target.value)}
            disabled={!packages?.length}
          >
            {packages?.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="Time range">
          {ranges.map((r) => (
            <button
              key={r.weeks}
              type="button"
              aria-pressed={range === r.weeks}
              onClick={() => setRange(r.weeks)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="empty">Couldn't load the data: {error}</div>}
      {packages?.length === 0 && <div className="empty">No reports yet.</div>}
      <div className={loading ? "loading" : undefined}>
        {data && <Dashboard data={data} range={range} />}
      </div>
      <footer>
        Weeks run Monday to Sunday (UTC). Each install counts once a week, with
        what it last reported; the current week shows once it's over.
      </footer>
    </main>
  );
}
