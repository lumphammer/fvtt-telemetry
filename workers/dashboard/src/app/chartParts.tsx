import { useEffect, useRef, useState, type ReactNode } from "react";

import { otherLabel } from "./data.ts";

/** Categorical colours, in slot order (see styles.css). */
const seriesSlots = 8;

/** The colour for the series at `index`; "Other" is always the gray. */
export function seriesColor(name: string, index: number) {
  if (name === otherLabel || index >= seriesSlots) return "var(--other)";
  return `var(--series-${index + 1})`;
}

/** Track an element's width, for sizing SVG charts. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round `max` up to a clean axis maximum, and give ticks up to it. */
export function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ??
    rough;
  const ticks: number[] = [];
  for (let t = 0; t < max + step / 2; t += step) ticks.push(t);
  if ((ticks.at(-1) ?? 0) < max) ticks.push(ticks.length * step);
  return ticks;
}

export type TooltipState = {
  x: number;
  y: number;
  content: ReactNode;
} | null;

/**
 * A tooltip positioned inside its chart, flipping to the left of the pointer
 * near the right edge.
 */
export function Tooltip({
  state,
  width,
}: {
  state: TooltipState;
  width: number;
}) {
  if (!state) return null;
  const flip = state.x > width * 0.6;
  return (
    <div
      className="tooltip"
      role="status"
      style={{
        top: state.y,
        left: flip ? undefined : state.x + 12,
        right: flip ? width - state.x + 12 : undefined,
      }}
    >
      {state.content}
    </div>
  );
}

export function TooltipRow({
  color,
  value,
  label,
}: {
  color?: string;
  value: string;
  label: string;
}) {
  return (
    <div className="tooltip-row">
      {color && <i className="line-key" style={{ background: color }} />}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/** A chart card: title, subtitle, and a switch to its table view. */
export function ChartCard({
  title,
  subtitle,
  wide = false,
  chart,
  table,
}: {
  title: string;
  subtitle?: string;
  wide?: boolean;
  chart: ReactNode;
  table: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className={wide ? "card wide" : "card"}>
      <div className="card-header">
        <figcaption>
          <div className="card-title">{title}</div>
          {subtitle && <div className="card-subtitle">{subtitle}</div>}
        </figcaption>
        <button
          type="button"
          aria-pressed={showTable}
          onClick={() => setShowTable(!showTable)}
        >
          {showTable ? "Chart" : "Table"}
        </button>
      </div>
      {showTable ? <div className="table-scroll">{table}</div> : chart}
    </figure>
  );
}

export function Legend({ series }: { series: string[] }) {
  return (
    <div className="legend">
      {series.map((name, i) => (
        <span className="legend-item" key={name}>
          <i className="swatch" style={{ background: seriesColor(name, i) }} />
          {name}
        </span>
      ))}
    </div>
  );
}

export function Empty() {
  return <div className="empty">No data for these weeks yet.</div>;
}
