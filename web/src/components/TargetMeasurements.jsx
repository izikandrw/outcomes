import { useState } from "react";
import { COMMON_UNITS } from "./TargetForm.jsx";
import { PlusIcon } from './icons.jsx';
import {
  formatValue,
  measurementsForTarget,
  targetRange,
} from "../lib/links.js";

// A reading applies to a day, stored as UTC midnight. Reading it back in local
// time would show the day before for anyone west of UTC, so the calendar day is
// rendered in the zone it was stored in.
const formatMeasuredAt = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });

// Every reading taken against one target, newest first, so the latest number
// is the first thing seen. The unit lives on the target, so it heads the value
// column rather than repeating on every row.
export default function TargetMeasurements({ target, measurements, onAddReading, onUpdateTarget }) {
  const series = measurementsForTarget(measurements, target);
  const readings = [...series].reverse();

  return (
    <div className="target-measurements">
      <p className="target-measurements-range">
        <EditableRange target={target} onUpdateTarget={onUpdateTarget} />
      </p>
      <div className="target-measurements-actions">
        <button type="button" className="ghost with-icon small" onClick={() => onAddReading(target)}>
          <PlusIcon />
          Add reading
        </button>
      </div>
      <MeasurementChart target={target} series={series} />
      {readings.length === 0 ? (
        <p className="empty no-targets">No readings yet.</p>
      ) : (
        <details className="measurement-accordion" open>
          <summary>
            {readings.length} reading{readings.length === 1 ? "" : "s"}
          </summary>
          <div className="table-scroll">
            <table className="measurement-table">
              <thead>
                <tr>
                  <th>Measured at</th>
                  <th className="num">Value ({target.unit})</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((reading) => (
                  <tr key={reading.id}>
                    <td>{formatMeasuredAt(reading.measured_at)}</td>
                    <td className="num">{formatValue(reading.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

// The range pill, with each of its three parts (baseline, target, unit)
// editable in place: hover marks it, click swaps it for an input, Enter or
// blur saves and Escape backs out. The API takes whole targets, so the rest of
// the target is sent back unchanged.
function EditableRange({ target, onUpdateTarget }) {
  const [field, setField] = useState(null);
  const [error, setError] = useState(null);

  async function commit(name, raw) {
    setField(null);
    const text = raw.trim();
    const numeric = name !== "unit";
    if (text === String(target[name])) return;
    if (!text || (numeric && !Number.isFinite(Number(text)))) {
      return setError(numeric ? "Must be a number." : "Unit is required.");
    }
    const next = { ...target, [name]: numeric ? Number(text) : text };
    if (Number(next.baseline_value) === Number(next.target_value)) {
      return setError("Baseline and target can't be the same.");
    }
    setError(null);
    try {
      await onUpdateTarget(target, {
        outcome_id: target.outcome_id ?? null,
        impact_id: target.impact_id ?? null,
        name: target.name ?? null,
        description: target.description ?? null,
        unit: next.unit,
        baseline_value: Number(next.baseline_value),
        target_value: Number(next.target_value),
        baseline_at: target.baseline_at ?? null,
        due_at: target.due_at ?? null,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  const part = (name, label) =>
    field === name ? (
      <input
        autoFocus
        className="target-range-input"
        aria-label={label}
        inputMode={name === "unit" ? undefined : "decimal"}
        list={name === "unit" ? "target-unit-options" : undefined}
        defaultValue={target[name]}
        size={Math.max(String(target[name]).length, 3)}
        onBlur={(e) => commit(name, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.onblur = null;
            setField(null);
          }
        }}
      />
    ) : (
      <button
        type="button"
        className="target-range-part"
        title={`Edit ${label.toLowerCase()}`}
        onClick={() => setField(name)}
      >
        {name === "unit" ? target.unit : formatValue(target[name])}
      </button>
    );

  return (
    <>
      <span className="target-range">
        {part("baseline_value", "Baseline")} → {part("target_value", "Target")}{" "}
        {part("unit", "Unit")}
      </span>
      {field === "unit" && (
        <datalist id="target-unit-options">
          {COMMON_UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      )}
      {error && <span className="error target-range-error">{error}</span>}
    </>
  );
}

const W = 600;
const H = 220;
const PAD = { top: 14, right: 16, bottom: 28, left: 44 };

const shortDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

// A trend needs at least two readings at different moments, so anything less
// is left as the table alone. The target value is drawn as a dashed line and
// kept inside the y-range, so the gap still left to travel is always visible.
function MeasurementChart({ target, series }) {
  const points = series
    .map((reading) => ({
      t: new Date(reading.measured_at).getTime(),
      v: Number(reading.value),
      reading,
    }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v));
  if (points.length < 2 || points[0].t === points.at(-1).t) return null;

  const goal = Number(target.target_value);
  const values = Number.isFinite(goal)
    ? [...points.map((p) => p.v), goal]
    : points.map((p) => p.v);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const margin = (hi - lo) * 0.08;
  lo -= margin;
  hi += margin;

  const t0 = points[0].t;
  const t1 = points.at(-1).t;
  const x = (t) =>
    PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v) =>
    PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`,
    )
    .join(" ");

  return (
    <svg
      className="measurement-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Line chart of ${points.length} readings, ${formatValue(points[0].v)} to ${formatValue(points.at(-1).v)} ${target.unit}`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            className="chart-grid"
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
          />
          <text
            className="chart-label"
            x={PAD.left - 6}
            y={y(tick)}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {formatValue(tick)}
          </text>
        </g>
      ))}
      {Number.isFinite(goal) && (
        <line
          className="chart-goal"
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(goal)}
          y2={y(goal)}
        >
          <title>{`Target ${formatValue(goal)} ${target.unit}`}</title>
        </line>
      )}
      <path className="chart-line" d={path} />
      {points.map((p) => (
        <circle
          key={p.reading.id}
          className="chart-point"
          cx={x(p.t)}
          cy={y(p.v)}
          r="3.5"
        >
          <title>{`${formatValue(p.v)} ${target.unit} · ${formatMeasuredAt(p.t)}`}</title>
        </circle>
      ))}
      <text className="chart-label" x={PAD.left} y={H - 8} textAnchor="start">
        {shortDate(t0)}
      </text>
      <text
        className="chart-label"
        x={W - PAD.right}
        y={H - 8}
        textAnchor="end"
      >
        {shortDate(t1)}
      </text>
    </svg>
  );
}
