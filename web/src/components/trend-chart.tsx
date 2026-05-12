"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { TimePoint } from "@/lib/types";

export function TrendChart({ timeSeries, height = 220 }: { timeSeries: TimePoint[]; height?: number }) {
  if (timeSeries.length === 0) {
    return <p className="text-sm text-slate-400 italic">No data</p>;
  }

  const data = timeSeries.map((t) => ({
    date: t.date.slice(5),
    Bugs: t.bugs,
    Regressions: t.regressions,
    Incidents: t.incidents,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        />
        <Line type="monotone" dataKey="Bugs" stroke="#6366f1" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Regressions" stroke="#dc2626" strokeWidth={2} dot={false} strokeDasharray="4 2" />
        <Line type="monotone" dataKey="Incidents" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="6 3" />
      </LineChart>
    </ResponsiveContainer>
  );
}
