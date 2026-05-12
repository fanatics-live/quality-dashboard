"use client";

import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const TYPE_COLORS: Record<string, string> = {
  regression: "#dc2626",
  progression: "#2563eb",
  unknown: "#9ca3af",
};

const SEV_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#6b7280",
};

const ENV_COLOR = "#6366f1";

export function BugTypeDonut({ byType }: { byType: { regression: number; progression: number; unknown: number } }) {
  const data = [
    { name: "Regression", value: byType.regression },
    { name: "Progression", value: byType.progression },
    { name: "Unclassified", value: byType.unknown },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="text-sm text-slate-400 italic">No data</p>;
  }

  const colors = [TYPE_COLORS.regression, TYPE_COLORS.progression, TYPE_COLORS.unknown];

  return (
    <div className="flex items-center justify-center gap-6">
      <ResponsiveContainer width={130} height={130}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={35} outerRadius={55} paddingAngle={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[i] }} />
            <span className="text-slate-600 dark:text-slate-400">{d.name}:</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SeverityChart({ bySeverity }: { bySeverity: Record<string, number> }) {
  const data = Object.entries(bySeverity)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  if (data.length === 0) {
    return <p className="text-sm text-slate-400 italic">No data</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
      <BarChart data={data} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={60} />
        <Tooltip />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={SEV_COLORS[d.name] ?? "#6366f1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EnvironmentChart({ byEnvironment }: { byEnvironment: Record<string, number> }) {
  const data = Object.entries(byEnvironment)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  if (data.length === 0) {
    return <p className="text-sm text-slate-400 italic">No data</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
        <Tooltip />
        <Bar dataKey="value" fill={ENV_COLOR} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AutomationChart({ projects }: { projects: Array<{ projectName: string; totalCases: number; automatedCases: number; manualCases: number }> }) {
  if (projects.length === 0) {
    return <p className="text-sm text-slate-400 italic">No automation data</p>;
  }

  const data = projects.map((p) => ({
    name: p.projectName.length > 15 ? p.projectName.slice(0, 12) + "..." : p.projectName,
    Automated: p.automatedCases,
    Manual: p.manualCases,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Automated" fill="#059669" stackId="a" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Manual" fill="#d1d5db" stackId="a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
