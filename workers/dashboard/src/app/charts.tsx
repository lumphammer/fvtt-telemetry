import { useState, type KeyboardEvent, type PointerEvent } from "react";

import {
  Empty,
  Legend,
  niceTicks,
  seriesColor,
  Tooltip,
  TooltipRow,
  useWidth,
  type TooltipState,
} from "./chartParts.tsx";
import {
  formatCount,
  formatPercent,
  formatWeek,
  type ShareSeries,
} from "./data.ts";

const plotHeight = 200;
const axisBand = 24;
const margin = { left: 40, right: 48, top: 8 };

/** Move a highlighted index with the arrow keys. */
function arrowKeys(
  event: KeyboardEvent,
  index: number | null,
  count: number,
  set: (i: number) => void,
) {
  if (event.key === "ArrowLeft") set(Math.max(0, (index ?? count) - 1));
  else if (event.key === "ArrowRight")
    set(Math.min(count - 1, (index ?? -1) + 1));
  else return;
  event.preventDefault();
}

/** Labels for the first, middle and last weeks. */
function weekLabels(weeks: string[]) {
  if (weeks.length <= 2) return weeks.map((_, i) => i);
  return [0, Math.floor((weeks.length - 1) / 2), weeks.length - 1];
}

/**
 * One series over the weeks: a 2px line over a 10% wash, with a crosshair
 * that snaps to the nearest week.
 */
export function LineChart({
  points,
  label,
}: {
  points: { week: string; value: number }[];
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [index, setIndex] = useState<number | null>(null);
  if (points.length === 0) return <Empty />;

  const ticks = niceTicks(Math.max(...points.map((p) => p.value)));
  const max = ticks.at(-1) ?? 1;
  const innerWidth = Math.max(width - margin.left - margin.right, 1);
  const x = (i: number) =>
    margin.left +
    (points.length === 1
      ? innerWidth / 2
      : (i / (points.length - 1)) * innerWidth);
  const y = (v: number) => margin.top + plotHeight - (v / max) * plotHeight;
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`)
    .join("");
  const area = `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const last = points.at(-1)!;

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    setIndex(
      Math.min(
        points.length - 1,
        Math.max(0, Math.round(fraction * (points.length - 1))),
      ),
    );
  };
  const current = index === null ? null : points[index];
  const tooltip: TooltipState = current
    ? {
        x: x(index!),
        y: margin.top,
        content: (
          <>
            <div className="tooltip-title">
              Week of {formatWeek(current.week, true)}
            </div>
            <TooltipRow
              color="var(--series-1)"
              value={formatCount(current.value)}
              label={label}
            />
          </>
        ),
      }
    : null;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={margin.top + plotHeight + axisBand}
          role="img"
          aria-label={`${label}, by week`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={margin.left}
                x2={margin.left + innerWidth}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "var(--axis)" : "var(--grid)"}
              />
              <text x={margin.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {formatCount(t)}
              </text>
            </g>
          ))}
          {weekLabels(points.map((p) => p.week)).map((i) => (
            <text
              key={i}
              x={x(i)}
              y={margin.top + plotHeight + 16}
              textAnchor={
                i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
              }
            >
              {formatWeek(points[i]!.week)}
            </text>
          ))}
          <path d={area} fill="var(--series-1)" opacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={x(points.length - 1)}
            cy={y(last.value)}
            r={4}
            fill="var(--series-1)"
            stroke="var(--surface-1)"
            strokeWidth={2}
          />
          <text
            className="end-label"
            x={x(points.length - 1) + 8}
            y={y(last.value)}
            dy="0.32em"
          >
            {formatCount(last.value)}
          </text>
          {current && (
            <>
              <line
                x1={x(index!)}
                x2={x(index!)}
                y1={margin.top}
                y2={margin.top + plotHeight}
                stroke="var(--axis)"
              />
              <circle
                cx={x(index!)}
                cy={y(current.value)}
                r={4}
                fill="var(--series-1)"
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            </>
          )}
          <rect
            className="hit"
            x={margin.left - 8}
            y={margin.top}
            width={innerWidth + 16}
            height={plotHeight}
            fill="transparent"
            tabIndex={0}
            aria-label={`${label}: use the arrow keys to read each week`}
            onPointerMove={pick}
            onPointerLeave={() => setIndex(null)}
            onFocus={() => setIndex(points.length - 1)}
            onBlur={() => setIndex(null)}
            onKeyDown={(e) => arrowKeys(e, index, points.length, setIndex)}
          />
        </svg>
      )}
      <Tooltip state={tooltip} width={width} />
    </div>
  );
}

/**
 * Shares over time as 100% stacked columns, one per week, with a 2px gap
 * between segments. Hovering a column lists every series for that week.
 */
export function StackedColumns({ data }: { data: ShareSeries }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [index, setIndex] = useState<number | null>(null);
  const weeks = data.weeks.filter((w) => w.total > 0);
  if (weeks.length === 0) return <Empty />;

  const innerWidth = Math.max(width - margin.left - 8, 1);
  const band = innerWidth / weeks.length;
  const columnWidth = Math.max(Math.min(24, band - 2), 1);
  const y = (fraction: number) =>
    margin.top + plotHeight - fraction * plotHeight;
  const gap = 2;

  const current = index === null ? null : weeks[index];
  const tooltip: TooltipState = current
    ? {
        x: margin.left + band * (index! + 0.5),
        y: margin.top,
        content: (
          <>
            <div className="tooltip-title">
              Week of {formatWeek(current.week, true)} ·{" "}
              {formatCount(current.total)} installs
            </div>
            {data.series.map((name, i) => (
              <TooltipRow
                key={name}
                color={seriesColor(name, i)}
                value={formatPercent(current.values[name] ?? 0, current.total)}
                label={`${name} (${formatCount(current.values[name] ?? 0)})`}
              />
            ))}
          </>
        ),
      }
    : null;

  return (
    <>
      <Legend series={data.series} />
      <div className="chart" ref={ref}>
        {width > 0 && (
          <svg
            width={width}
            height={margin.top + plotHeight + axisBand}
            role="img"
            aria-label="Share of installs by week"
          >
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line
                  x1={margin.left}
                  x2={margin.left + innerWidth}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? "var(--axis)" : "var(--grid)"}
                />
                <text x={margin.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {t * 100}%
                </text>
              </g>
            ))}
            {weekLabels(weeks.map((w) => w.week)).map((i) => (
              <text
                key={i}
                x={margin.left + band * (i + 0.5)}
                y={margin.top + plotHeight + 16}
                textAnchor={
                  i === 0 ? "start" : i === weeks.length - 1 ? "end" : "middle"
                }
              >
                {formatWeek(weeks[i]!.week)}
              </text>
            ))}
            {weeks.map((week, wi) => {
              const left = margin.left + band * wi + (band - columnWidth) / 2;
              let cumulative = 0;
              const segments = data.series
                .map((name, si) => ({
                  name,
                  si,
                  value: week.values[name] ?? 0,
                }))
                .filter((s) => s.value > 0);
              return (
                <g
                  key={week.week}
                  opacity={index === null || index === wi ? 1 : 0.6}
                >
                  {segments.map(({ name, si, value }, i) => {
                    const bottom = y(cumulative / week.total);
                    cumulative += value;
                    const top = y(cumulative / week.total);
                    const isTop = i === segments.length - 1;
                    // the gap comes off the top of every segment but the last
                    const height = Math.max(
                      bottom - top - (isTop ? 0 : gap),
                      0.5,
                    );
                    const radius = isTop
                      ? Math.min(4, columnWidth / 2, height)
                      : 0;
                    const segmentTop = bottom - height;
                    return (
                      <path
                        key={name}
                        fill={seriesColor(name, si)}
                        d={`M${left},${bottom}V${segmentTop + radius}Q${left},${segmentTop} ${left + radius},${segmentTop}H${left + columnWidth - radius}Q${left + columnWidth},${segmentTop} ${left + columnWidth},${segmentTop + radius}V${bottom}Z`}
                      />
                    );
                  })}
                  <rect
                    className="hit"
                    x={margin.left + band * wi}
                    y={margin.top}
                    width={band}
                    height={plotHeight}
                    fill="transparent"
                    tabIndex={wi === weeks.length - 1 ? 0 : -1}
                    aria-label={`Week of ${formatWeek(week.week, true)}`}
                    onPointerEnter={() => setIndex(wi)}
                    onPointerLeave={() => setIndex(null)}
                    onFocus={() => setIndex(wi)}
                    onBlur={() => setIndex(null)}
                    onKeyDown={(e) =>
                      arrowKeys(e, index, weeks.length, setIndex)
                    }
                  />
                </g>
              );
            })}
          </svg>
        )}
        <Tooltip state={tooltip} width={width} />
      </div>
    </>
  );
}

/**
 * One week's values as horizontal bars, value and share at each bar's tip.
 * One series, so one colour.
 */
export function BarList({
  items,
  total,
  limit = 12,
}: {
  items: { value: string; installs: number }[];
  /** What the shares are of. */
  total: number;
  limit?: number;
}) {
  if (items.length === 0) return <Empty />;
  const shown = items.slice(0, limit);
  const max = Math.max(...shown.map((i) => i.installs));
  return (
    <>
      <div className="bars">
        {shown.map((item) => (
          <BarRow key={item.value} item={item} max={max} total={total} />
        ))}
      </div>
      {items.length > limit && (
        <div className="more">
          And {items.length - limit} more in the table.
        </div>
      )}
    </>
  );
}

function BarRow({
  item,
  max,
  total,
}: {
  item: { value: string; installs: number };
  max: number;
  total: number;
}) {
  const share = formatPercent(item.installs, total);
  return (
    <>
      <div className="bar-label">{item.value || "(none)"}</div>
      <div
        className="bar-row"
        tabIndex={0}
        aria-label={`${item.value}: ${formatCount(item.installs)} installs, ${share}`}
      >
        <div
          className="bar"
          style={{ width: `calc((100% - 96px) * ${item.installs / max})` }}
        />
        <div className="bar-value">
          {formatCount(item.installs)} <span>{share}</span>
        </div>
      </div>
    </>
  );
}

/** A tiny trend line: the de-emphasis gray, with the latest point accented. */
export function Sparkline({ values }: { values: number[] }) {
  const width = 96;
  const height = 32;
  if (values.length < 2) return null;
  // the trend, not the size: scaled to its own range
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const x = (i: number) => 4 + (i / (values.length - 1)) * (width - 8);
  const y = (v: number) => height - 4 - ((v - min) / range) * (height - 8);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)
    .join("");
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="var(--axis)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <circle
        cx={x(values.length - 1)}
        cy={y(values.at(-1)!)}
        r={4}
        fill="var(--series-1)"
        stroke="var(--surface-1)"
        strokeWidth={2}
      />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  delta,
  trend,
}: {
  label: string;
  value: string;
  delta?: { text: string; direction: "up" | "down" | "flat"; period: string };
  trend?: number[];
}) {
  return (
    <div className="card">
      <div className="tile-label">{label}</div>
      <div className="tile-row">
        <div>
          <div className="tile-value">{value}</div>
          {delta && (
            <div className="delta">
              <span
                className={
                  delta.direction === "flat" ? undefined : delta.direction
                }
              >
                {delta.direction === "up"
                  ? "▲ "
                  : delta.direction === "down"
                    ? "▼ "
                    : ""}
                {delta.text}
              </span>{" "}
              {delta.period}
            </div>
          )}
        </div>
        {trend && <Sparkline values={trend} />}
      </div>
    </div>
  );
}
