import { useState, type ReactNode } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtDay, fmtNumber, MOVEMENT_COLOR, MOVEMENT_LABEL } from "../lib/format";
import type { MovementType, Overview } from "../lib/types";
import { Table, td, th } from "./ui";

// Chart conventions (dataviz skill): recessive grid and axes, one y-axis,
// thin marks with rounded data ends, 2px surface gaps between stacked
// segments, a legend for ≥ 2 series (in stacking order), hover tooltips, and
// a table view so nothing is readable by color alone. No entry animation:
// the dashboard refreshes every minute.

const AXIS = { stroke: "#CBD5E1", tick: { fill: "#64748B", fontSize: 12 }, tickLine: false } as const;
const GRID = <CartesianGrid stroke="#F1F5F9" vertical={false} />;
const TYPES: MovementType[] = ["inbound", "outbound", "transfer", "adjustment"];

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: number; color: string }[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-800">{title}</p>
      {rows.map(r => (
        <p key={r.label} className="flex items-center gap-2 text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
          <span className="flex-1">{r.label}</span>
          <span className="tabular font-medium text-slate-900">{fmtNumber(r.value)}</span>
        </p>
      ))}
    </div>
  );
}

function legendText(value: string) {
  return <span className="text-xs text-slate-600">{value}</span>;
}

/** Chart with a "Ver tabla" toggle that swaps in the same data as a table. */
export function ChartFrame({ chart, table }: { chart: ReactNode; table: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button onClick={() => setAsTable(v => !v)} className="text-xs font-medium text-indigo-600 hover:underline">
          {asTable ? "Ver gráfica" : "Ver tabla"}
        </button>
      </div>
      {asTable ? <div className="max-h-72 overflow-y-auto">{table}</div> : chart}
    </div>
  );
}

export function MovementsByDayChart({ series }: { series: Overview["movements"]["series"] }) {
  const present = TYPES.filter(t => series.some(d => d[t] > 0));
  const shown = present.length ? present : TYPES.slice(0, 3);
  return (
    <ChartFrame
      chart={
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
              {GRID}
              <XAxis dataKey="day" tickFormatter={fmtDay} {...AXIS} minTickGap={16} />
              <YAxis allowDecimals={false} {...AXIS} axisLine={false} />
              <Tooltip
                cursor={{ fill: "#F1F5F9" }}
                content={({ active, payload, label }) => active && payload?.length ? (
                  <TooltipBox
                    title={fmtDay(String(label))}
                    rows={shown.map(t => ({ label: MOVEMENT_LABEL[t], value: Number(payload[0].payload[t] ?? 0), color: MOVEMENT_COLOR[t] }))}
                  />
                ) : null}
              />
              <Legend formatter={legendText} iconType="square" iconSize={10} itemSorter={null} />
              {shown.map((t, i) => (
                <Bar
                  key={t} dataKey={t} name={MOVEMENT_LABEL[t]} stackId="m" fill={MOVEMENT_COLOR[t]}
                  stroke="#FFFFFF" strokeWidth={2} maxBarSize={36} isAnimationActive={false}
                  radius={i === shown.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
      table={
        <Table>
          <thead><tr><th className={th}>Día</th>{shown.map(t => <th key={t} className={`${th} text-right`}>{MOVEMENT_LABEL[t]}</th>)}</tr></thead>
          <tbody>
            {[...series].reverse().map(d => (
              <tr key={d.day}><td className={td}>{fmtDay(d.day)}</td>{shown.map(t => <td key={t} className={`${td} tabular text-right`}>{d[t]}</td>)}</tr>
            ))}
          </tbody>
        </Table>
      }
    />
  );
}

export function UnitsFlowChart({ series }: { series: Overview["movements"]["series"] }) {
  const lines = [
    { key: "unitsIn", label: "Unidades que entran", color: MOVEMENT_COLOR.inbound },
    { key: "unitsOut", label: "Unidades que salen", color: MOVEMENT_COLOR.outbound },
  ] as const;
  return (
    <ChartFrame
      chart={
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              {GRID}
              <XAxis dataKey="day" tickFormatter={fmtDay} {...AXIS} minTickGap={16} />
              <YAxis allowDecimals={false} {...AXIS} axisLine={false} />
              <Tooltip
                cursor={{ stroke: "#94A3B8", strokeDasharray: "3 3" }}
                content={({ active, payload, label }) => active && payload?.length ? (
                  <TooltipBox
                    title={fmtDay(String(label))}
                    rows={lines.map(l => ({ label: l.label, value: Number(payload[0].payload[l.key] ?? 0), color: l.color }))}
                  />
                ) : null}
              />
              <Legend formatter={legendText} iconType="plainline" itemSorter={null} />
              {lines.map(l => (
                <Line
                  key={l.key} dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2} type="monotone" isAnimationActive={false}
                  dot={series.length <= 14 ? { r: 4, strokeWidth: 2, stroke: "#FFFFFF", fill: l.color } : false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#FFFFFF" }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      }
      table={
        <Table>
          <thead><tr><th className={th}>Día</th><th className={`${th} text-right`}>Entran</th><th className={`${th} text-right`}>Salen</th></tr></thead>
          <tbody>
            {[...series].reverse().map(d => (
              <tr key={d.day}><td className={td}>{fmtDay(d.day)}</td><td className={`${td} tabular text-right`}>{fmtNumber(d.unitsIn)}</td><td className={`${td} tabular text-right`}>{fmtNumber(d.unitsOut)}</td></tr>
            ))}
          </tbody>
        </Table>
      }
    />
  );
}
