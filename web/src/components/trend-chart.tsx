"use client";

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { TimePoint, IncidentRecord } from "@/lib/types";

export function BugBurnChart({ timeSeries, height = 200 }: { timeSeries: TimePoint[]; height?: number }) {
  if (timeSeries.length === 0) {
    return <p className="text-sm text-slate-400 italic">No data</p>;
  }

  const data = timeSeries.map((t) => ({
    date: t.date.slice(5),
    "Total Bugs": t.cumulativeBugs,
    "Regressions": t.cumulativeRegressions,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} width={35} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            fontSize: 12, borderRadius: 8,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        />
        <Area type="monotone" dataKey="Total Bugs" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
        <Area type="monotone" dataKey="Regressions" stroke="#dc2626" fill="#dc2626" fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 2" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const SEV_COLORS: Record<string, string> = {
  "SEV-1": "#dc2626",
  "SEV-2": "#ea580c",
  "SEV-3": "#f59e0b",
};

const SEV_ORDER = ["SEV-1", "SEV-2", "SEV-3"];

function normalizeSev(severity: string): string {
  if (severity.startsWith("SEV-1")) return "SEV-1";
  if (severity.startsWith("SEV-2")) return "SEV-2";
  if (severity.startsWith("SEV-3")) return "SEV-3";
  return "Other";
}

export function IncidentTrendChart({
  timeSeries,
  incidents,
  height = 200,
}: {
  timeSeries: TimePoint[];
  incidents: IncidentRecord[];
  height?: number;
}) {
  if (timeSeries.length === 0 || incidents.length === 0) {
    return <p className="text-sm text-slate-400 italic">No incidents in this period</p>;
  }

  const dayMap = new Map<string, Record<string, number>>();
  for (const t of timeSeries) {
    dayMap.set(t.date, {});
  }

  for (const inc of incidents) {
    const day = inc.createdAt.slice(0, 10);
    const bucket = dayMap.get(day);
    if (!bucket) continue;
    const sev = normalizeSev(inc.severity);
    bucket[sev] = (bucket[sev] ?? 0) + 1;
  }

  const sevKeys = new Set<string>();
  for (const bucket of dayMap.values()) {
    for (const k of Object.keys(bucket)) sevKeys.add(k);
  }
  const orderedKeys = SEV_ORDER.filter((k) => sevKeys.has(k));
  if (sevKeys.has("Other")) orderedKeys.push("Other");

  const data = timeSeries.map((t) => {
    const bucket = dayMap.get(t.date) ?? {};
    return { date: t.date.slice(5), ...bucket };
  });

  const hasData = data.some((d) => orderedKeys.some((k) => (d as Record<string, unknown>)[k]));
  if (!hasData) {
    return <p className="text-sm text-slate-400 italic">No incidents in this period</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} width={25} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            fontSize: 12, borderRadius: 8,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {orderedKeys.map((sev, i) => (
          <Bar
            key={sev}
            dataKey={sev}
            stackId="incidents"
            fill={SEV_COLORS[sev] ?? "#9ca3af"}
            radius={i === orderedKeys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
