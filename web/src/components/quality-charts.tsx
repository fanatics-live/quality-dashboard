"use client";

import { useState } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { Delta, LinearBug } from "@/lib/types";
import { DetailModal, bugsToItems } from "./detail-modal";

const TYPE_COLORS: Record<string, string> = {
  regression: "#dc2626",
  progression: "#2563eb",
  unknown: "#9ca3af",
};

const SEV_COLORS: Record<string, string> = {
  Critical: "#dc2626",
  High: "#ea580c",
  Medium: "#d97706",
  Low: "#6b7280",
  Unclassified: "#9ca3af",
};

const ENV_COLORS: Record<string, string> = {
  Production: "#dc2626",
  Staging: "#ea580c",
  Development: "#6366f1",
  Dogfood: "#8b5cf6",
  Unclassified: "#9ca3af",
};

interface BugTypeTrends {
  regression: Delta;
  progression: Delta;
  unknown: Delta;
}

function TrendBadge({ delta }: { delta: Delta }) {
  if (delta.changePercent === null || delta.changePercent === 0) return null;
  const up = delta.direction === "up";
  const color = delta.sentiment === "bad" ? "text-red-400" : delta.sentiment === "good" ? "text-emerald-400" : "text-slate-400";
  return (
    <span className={`text-[10px] font-semibold ${color}`}>
      {up ? "+" : ""}{delta.changePercent}%
    </span>
  );
}

function TypeRow({ name, value, color, delta, onSelect }: { name: string; value: number; color: string; delta?: Delta; onSelect: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-2 text-xs hover:underline cursor-pointer"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
        <span className="text-slate-600 dark:text-slate-400">{name}:</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>
        {delta && <TrendBadge delta={delta} />}
      </button>
      {hover && delta && (
        <div className="absolute left-0 bottom-full mb-1.5 z-50 w-48 p-2 rounded-lg shadow-lg bg-slate-800 dark:bg-slate-700 text-[11px] text-slate-100 pointer-events-none">
          <div className="flex justify-between"><span>Current period</span><span className="font-semibold">{delta.current}</span></div>
          <div className="flex justify-between"><span>Previous period</span><span className="font-semibold">{delta.previous}</span></div>
          {delta.changePercent !== null && (
            <div className="flex justify-between border-t border-slate-600 mt-1 pt-1">
              <span>Change</span>
              <span className={`font-semibold ${delta.sentiment === "bad" ? "text-red-400" : delta.sentiment === "good" ? "text-emerald-400" : ""}`}>
                {delta.change > 0 ? "+" : ""}{delta.change} ({delta.changePercent > 0 ? "+" : ""}{delta.changePercent}%)
              </span>
            </div>
          )}
          <div className="absolute left-4 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-slate-800 dark:border-t-slate-700" />
        </div>
      )}
    </div>
  );
}

type BugTypeKey = "regression" | "progression" | "unknown";

function TicketModal({ title, color, bugs, onClose }: { title: string; color: string; bugs: LinearBug[]; onClose: () => void }) {
  return <DetailModal title={title} color={color} items={bugsToItems(bugs)} onClose={onClose} />;
}

export function BugTypeDonut({ byType, bugsByType, trends }: {
  byType: { regression: number; progression: number; unknown: number };
  bugsByType?: Record<BugTypeKey, LinearBug[]>;
  trends?: BugTypeTrends;
}) {
  const [selected, setSelected] = useState<BugTypeKey | null>(null);

  const data = [
    { name: "Regression", key: "regression" as const, value: byType.regression },
    { name: "Progression", key: "progression" as const, value: byType.progression },
    { name: "Unclassified", key: "unknown" as const, value: byType.unknown },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="text-sm text-slate-400 italic">No data</p>;
  }

  const colors = [TYPE_COLORS.regression, TYPE_COLORS.progression, TYPE_COLORS.unknown];
  const selectedMeta = selected ? data.find((d) => d.key === selected) : null;

  return (
    <div className="flex items-center justify-center gap-6">
      <ResponsiveContainer width={130} height={130}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={35}
            outerRadius={55}
            paddingAngle={2}
            className="cursor-pointer"
            onClick={(_, i) => setSelected(data[i].key)}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2">
        {data.map((d, i) => (
          <TypeRow
            key={d.name}
            name={d.name}
            value={d.value}
            color={colors[i]}
            delta={trends?.[d.key]}
            onSelect={() => setSelected(d.key)}
          />
        ))}
      </div>
      {selected && selectedMeta && (
        <TicketModal
          title={selectedMeta.name}
          color={TYPE_COLORS[selected]}
          bugs={bugsByType?.[selected] ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export function SeverityChart({ bySeverity, bugsByGroup }: { bySeverity: Record<string, number>; bugsByGroup?: Record<string, LinearBug[]> }) {
  const [selected, setSelected] = useState<string | null>(null);

  const data = Object.entries(bySeverity)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  if (data.length === 0) {
    return <p className="text-sm text-slate-400 italic">No data</p>;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
        <BarChart data={data} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={60} />
          <Tooltip />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            className="cursor-pointer"
            onClick={(_, index) => setSelected(data[index].name)}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={SEV_COLORS[d.name] ?? "#6366f1"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {selected && (
        <TicketModal
          title={selected}
          color={SEV_COLORS[selected] ?? "#6366f1"}
          bugs={bugsByGroup?.[selected] ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

export function EnvironmentChart({ byEnvironment, bugsByGroup }: { byEnvironment: Record<string, number>; bugsByGroup?: Record<string, LinearBug[]> }) {
  const [selected, setSelected] = useState<string | null>(null);

  const data = Object.entries(byEnvironment)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  if (data.length === 0) {
    return <p className="text-sm text-slate-400 italic">No data</p>;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
        <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
          <Tooltip />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            className="cursor-pointer"
            onClick={(_, index) => setSelected(data[index].name)}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={ENV_COLORS[d.name] ?? "#6366f1"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {selected && (
        <TicketModal
          title={selected}
          color={ENV_COLORS[selected] ?? "#9ca3af"}
          bugs={bugsByGroup?.[selected] ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

export function AutomationChart({ projects }: { projects: Array<{ projectCode: string; projectName: string; totalCases: number; automatedCases: number; manualCases: number }> }) {
  if (projects.length === 0) {
    return <p className="text-sm text-slate-400 italic">No automation data</p>;
  }

  const data = projects.map((p) => ({
    name: p.projectName.length > 15 ? p.projectName.slice(0, 12) + "..." : p.projectName,
    code: p.projectCode,
    Automated: p.automatedCases,
    Manual: p.manualCases,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart
        data={data}
        margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
        className="cursor-pointer"
        onClick={(state: Record<string, unknown>) => {
          const payload = state?.activePayload as { payload: { code: string } }[] | undefined;
          if (payload?.[0]?.payload?.code) {
            window.open(`https://app.qase.io/project/${payload[0].payload.code}`, "_blank");
          }
        }}
      >
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
