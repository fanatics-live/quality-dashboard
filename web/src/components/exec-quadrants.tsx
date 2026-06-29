"use client";

import { useState } from "react";
import Link from "next/link";
import type { ExecSummary, Delta, TeamRisk, IncidentRecord, LinearBug } from "@/lib/types";
import { THRESHOLDS } from "@/lib/quality/thresholds";
import { Shield, AlertTriangle, Users, Info } from "lucide-react";
import { DetailModal, bugsToItems, incidentsToItems, type ModalItem } from "./detail-modal";

const OPEN_STATES = new Set(["triage", "backlog", "unstarted", "started"]);

function QuadrantCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  sentiment,
  info,
  detail,
  modal,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sentiment?: "good" | "bad" | "neutral";
  info?: string;
  detail?: React.ReactNode;
  modal?: { title: string; color: string; items: ModalItem[] };
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const clickable = !!modal && modal.items.length > 0;
  const color =
    sentiment === "good" ? "text-emerald-600 dark:text-emerald-400" :
    sentiment === "bad" ? "text-red-600 dark:text-red-400" :
    "text-slate-900 dark:text-slate-100";

  return (
    <>
      <div className="flex items-baseline justify-between py-1.5">
        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
          {label}
          {info && (
            <span className="relative inline-flex">
              <button
                type="button"
                onClick={() => setInfoOpen((v) => !v)}
                onFocus={() => setInfoOpen(true)}
                onBlur={() => setInfoOpen(false)}
                aria-label={`About ${label}`}
                aria-expanded={infoOpen}
                className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
              >
                <Info className="w-3 h-3" />
              </button>
              {infoOpen && (
                <div className="absolute left-0 bottom-full mb-1.5 z-50 w-56 px-2.5 py-2 rounded-lg shadow-lg bg-slate-800 dark:bg-slate-700 text-[11px] text-slate-100 leading-relaxed pointer-events-none">
                  {info}
                  <div className="absolute left-3 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-slate-800 dark:border-t-slate-700" />
                </div>
              )}
            </span>
          )}
        </span>
        <span className="relative">
          <span
            className={`text-sm font-bold ${color} ${clickable ? "cursor-pointer hover:underline" : detail ? "cursor-help" : ""}`}
            role={clickable ? "button" : undefined}
            aria-label={clickable ? `Show ${label} details` : undefined}
            tabIndex={clickable || detail ? 0 : undefined}
            onClick={clickable ? () => setModalOpen(true) : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModalOpen(true); } } : undefined}
            onMouseEnter={() => detail && setDetailOpen(true)}
            onMouseLeave={() => detail && setDetailOpen(false)}
            onFocus={() => detail && setDetailOpen(true)}
            onBlur={() => detail && setDetailOpen(false)}
          >
            {value}{unit && <span className="text-xs font-normal ml-0.5">{unit}</span>}
          </span>
          {detail && detailOpen && (
            <div className="absolute right-0 bottom-full mb-1.5 z-50 min-w-[10rem] p-2.5 rounded-lg shadow-lg bg-slate-800 dark:bg-slate-700 text-[11px] text-slate-100 pointer-events-none">
              {detail}
              <div className="absolute right-3 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-slate-800 dark:border-t-slate-700" />
            </div>
          )}
        </span>
      </div>
      {modal && modalOpen && (
        <DetailModal title={modal.title} color={modal.color} items={modal.items} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  watch: "bg-amber-400",
  stable: "bg-slate-300 dark:bg-slate-600",
  improving: "bg-emerald-500",
};

const RISK_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High Risk",
  watch: "Watch",
  stable: "Stable",
  improving: "Improving",
};

// Per-vertical reduction levers: the concrete bugs/regressions/aging to cut to
// lower this team's risk and lift its contribution to the overall grade. Ranked
// by the same risk weights used in computeTeamRisks (health-score.ts).
function verticalLevers(risk: TeamRisk): string[] {
  const out: { text: string; weight: number }[] = [];

  if (risk.openCriticals > 0) {
    out.push({ text: `Resolve ${risk.openCriticals} critical bug${risk.openCriticals > 1 ? "s" : ""}`, weight: risk.openCriticals * 15 });
  }
  if (risk.regressionRate > 15) {
    out.push({ text: `Cut regression rate (${risk.regressionRate}%)`, weight: risk.regressionRate });
  }
  const aged = risk.aging.aging + risk.aging.stale + risk.aging.critical;
  if (aged > 3) {
    out.push({ text: `Close ${aged} bug${aged > 1 ? "s" : ""} aging > 30d`, weight: aged * 3 });
  }
  if (risk.bugsDelta.sentiment === "bad" && risk.bugsDelta.changePercent !== null && risk.bugsDelta.changePercent > 30) {
    out.push({ text: `Stem bug growth (+${risk.bugsDelta.changePercent}% vs prior)`, weight: risk.bugsDelta.changePercent });
  }
  if (risk.stats.open > 10) {
    out.push({ text: `Reduce ${risk.stats.open} open bugs`, weight: risk.stats.open / 2 });
  }

  return out.sort((a, b) => b.weight - a.weight).map((o) => o.text);
}

export function ExecQuadrants({
  exec,
  trends,
  incidents,
}: {
  exec: ExecSummary;
  trends: { bugs: Delta; incidents: Delta };
  incidents: IncidentRecord[];
}) {
  const topRisks = exec.teamRisks.filter((t) => t.level === "critical" || t.level === "high" || t.level === "watch").slice(0, 8);
  const incidentItems = incidentsToItems(incidents);
  const prodBugItems = bugsToItems(exec.productionBugsList);
  const criticalItems = bugsToItems(exec.openCriticalsList);

  const prodOpenList = exec.productionBugsList.filter((b) => OPEN_STATES.has(b.stateType));
  const prodOpenItems = bugsToItems(prodOpenList);
  const prodOpenByVertical: Record<string, number> = {};
  for (const b of prodOpenList) prodOpenByVertical[b.vertical] = (prodOpenByVertical[b.vertical] ?? 0) + 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Customer Impact */}
      <QuadrantCard title="Customer Impact" icon={<Shield className="w-4 h-4" />}>
        <div className="space-y-0.5">
          <Metric
            label="Production Incidents"
            value={trends.incidents.current}
            sentiment={trends.incidents.current > THRESHOLDS.prodIncidents.bad ? "bad" : trends.incidents.current > 0 ? "neutral" : "good"}
            info="Number of production incidents reported via Incident.io during this period."
            modal={{ title: "Production Incidents", color: "#dc2626", items: incidentItems }}
            detail={
              Object.keys(exec.incidentsBySeverity).length > 0 ? (
                <div className="space-y-0.5">
                  {Object.entries(exec.incidentsBySeverity)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([sev, count]) => (
                      <div key={sev} className="flex justify-between">
                        <span>{sev}</span>
                        <span className="font-semibold">{count}</span>
                      </div>
                    ))}
                </div>
              ) : undefined
            }
          />
          <Metric
            label="Incident Trend"
            value={trends.incidents.change >= 0 ? `+${trends.incidents.change}` : `${trends.incidents.change}`}
            sentiment={trends.incidents.sentiment}
            info="Change in incident count compared to the previous period of the same length."
            modal={{ title: "Incidents — current period", color: "#dc2626", items: incidentItems }}
            detail={
              <div className="space-y-0.5">
                <div className="flex justify-between"><span>Current period</span><span className="font-semibold">{trends.incidents.current}</span></div>
                <div className="flex justify-between"><span>Previous period</span><span className="font-semibold">{trends.incidents.previous}</span></div>
                {trends.incidents.changePercent !== null && (
                  <div className="flex justify-between border-t border-slate-600 mt-1 pt-1">
                    <span>Change</span>
                    <span className="font-semibold">{trends.incidents.changePercent > 0 ? "+" : ""}{trends.incidents.changePercent}%</span>
                  </div>
                )}
              </div>
            }
          />
          <Metric
            label="Production Bugs total"
            value={exec.productionBugs}
            sentiment={exec.productionBugs > THRESHOLDS.prodBugs.bad ? "bad" : exec.productionBugs > THRESHOLDS.prodBugs.watch ? "neutral" : "good"}
            info="Bugs found in production environment, reported in Linear."
            modal={{ title: "Production Bugs total", color: "#dc2626", items: prodBugItems }}
            detail={
              Object.keys(exec.prodBugsByVertical).length > 0 ? (
                <div className="space-y-0.5">
                  {Object.entries(exec.prodBugsByVertical)
                    .sort(([, a], [, b]) => b - a)
                    .map(([vertical, count]) => (
                      <div key={vertical} className="flex justify-between gap-3">
                        <span className="truncate">{vertical}</span>
                        <span className="font-semibold shrink-0">{count}</span>
                      </div>
                    ))}
                </div>
              ) : undefined
            }
          />
          <Metric
            label="Production Escaped Bugs Ratio"
            value={exec.escapedDefectRate}
            unit="%"
            sentiment={exec.escapedDefectRate > THRESHOLDS.escapedDefectRate.bad ? "bad" : exec.escapedDefectRate > THRESHOLDS.escapedDefectRate.watch ? "neutral" : "good"}
            info="Percentage of environment-classified bugs that were found in production instead of being caught during QA or staging. Bugs without an environment label are excluded."
            modal={{ title: "Production Escaped Bugs", color: "#ea580c", items: prodBugItems }}
          />
          <Metric
            label="Production Bugs Open"
            value={prodOpenList.length}
            sentiment={prodOpenList.length > THRESHOLDS.prodBugs.bad ? "bad" : prodOpenList.length > THRESHOLDS.prodBugs.watch ? "neutral" : "good"}
            info="Production bugs that are still active (triage, backlog, or in progress) — excludes resolved/closed."
            modal={{ title: "Production Bugs Open", color: "#dc2626", items: prodOpenItems }}
            detail={
              Object.keys(prodOpenByVertical).length > 0 ? (
                <div className="space-y-0.5">
                  {Object.entries(prodOpenByVertical)
                    .sort(([, a], [, b]) => b - a)
                    .map(([vertical, count]) => (
                      <div key={vertical} className="flex justify-between gap-3">
                        <span className="truncate">{vertical}</span>
                        <span className="font-semibold shrink-0">{count}</span>
                      </div>
                    ))}
                </div>
              ) : undefined
            }
          />
          <Metric
            label="Critical Open Bugs"
            value={exec.openCriticals}
            sentiment={exec.openCriticals > 0 ? "bad" : "good"}
            info="Number of bugs marked Critical in Linear that are still unresolved (triage, backlog, or in progress)."
            modal={{ title: "Critical Open Bugs", color: "#dc2626", items: criticalItems }}
          />
        </div>
      </QuadrantCard>

      {/* Delivery Health */}
      <QuadrantCard title="Delivery Health" icon={<AlertTriangle className="w-4 h-4" />}>
        <div className="space-y-0.5">
          <Metric
            label="Pipeline Regression Rate"
            value={exec.pipelineRegressionRate}
            unit="%"
            sentiment={exec.pipelineRegressionRate > THRESHOLDS.pipelineRegressionRate.bad ? "bad" : exec.pipelineRegressionRate > THRESHOLDS.pipelineRegressionRate.watch ? "neutral" : "good"}
            info="Percentage of non-production bugs that are regressions — measures how often code changes break existing features before reaching customers."
            detail={
              exec.pipelineRegressionsByVertical.length > 0 ? (
                <div>
                  <div className="flex justify-between font-semibold border-b border-slate-600 pb-1 mb-1">
                    <span className="w-24">Vertical</span>
                    <span className="w-10 text-right">Reg.</span>
                    <span className="w-10 text-right">Total</span>
                    <span className="w-10 text-right">Rate</span>
                  </div>
                  {exec.pipelineRegressionsByVertical.map((r) => (
                    <div key={r.vertical} className="flex justify-between py-px">
                      <span className="w-24 truncate">{r.vertical}</span>
                      <span className="w-10 text-right">{r.regressions}</span>
                      <span className="w-10 text-right">{r.total}</span>
                      <span className="w-10 text-right font-semibold">{r.rate}%</span>
                    </div>
                  ))}
                </div>
              ) : undefined
            }
          />
          <Metric
            label="Pre-Prod Bug Trend"
            value={`${exec.preProdBugFlow.delta >= 0 ? "+" : ""}${exec.preProdBugFlow.delta}`}
            sentiment={exec.preProdBugFlow.delta > 0 ? "bad" : exec.preProdBugFlow.delta < 0 ? "good" : "neutral"}
            info="Net non-production bug flow: bugs created minus bugs closed during this period. Negative means the pre-prod backlog is shrinking."
            detail={
              exec.preProdBugFlow.byVertical.length > 0 ? (
                <div>
                  <div className="flex justify-between font-semibold border-b border-slate-600 pb-1 mb-1">
                    <span className="w-24">Team</span>
                    <span className="w-10 text-right">New</span>
                    <span className="w-10 text-right">Fixed</span>
                    <span className="w-10 text-right">Delta</span>
                  </div>
                  {exec.preProdBugFlow.byVertical.map((r) => (
                    <div key={r.vertical} className="flex justify-between py-px">
                      <span className="w-24 truncate">{r.vertical}</span>
                      <span className="w-10 text-right">{r.created}</span>
                      <span className="w-10 text-right">{r.closed}</span>
                      <span className={`w-10 text-right font-semibold ${r.delta > 0 ? "text-red-400" : r.delta < 0 ? "text-emerald-400" : ""}`}>
                        {r.delta > 0 ? "+" : ""}{r.delta}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1 mt-1 border-t border-slate-600 font-semibold">
                    <span className="w-24">Total</span>
                    <span className="w-10 text-right">{exec.preProdBugFlow.created}</span>
                    <span className="w-10 text-right">{exec.preProdBugFlow.closed}</span>
                    <span className={`w-10 text-right ${exec.preProdBugFlow.delta > 0 ? "text-red-400" : exec.preProdBugFlow.delta < 0 ? "text-emerald-400" : ""}`}>
                      {exec.preProdBugFlow.delta > 0 ? "+" : ""}{exec.preProdBugFlow.delta}
                    </span>
                  </div>
                </div>
              ) : undefined
            }
          />
          <Metric
            label="Test Automation Health"
            value={exec.automationHealth.passRate}
            unit="%"
            sentiment={exec.automationHealth.passRate >= THRESHOLDS.passRate.good ? "good" : exec.automationHealth.passRate >= THRESHOLDS.passRate.watch ? "neutral" : "bad"}
            info="Pass rate weighted by test count across all completed automation runs (QASE): total tests passed / total tests executed."
            detail={
              <div className="space-y-0.5">
                <div className="flex justify-between"><span>Pass Rate</span><span className="font-semibold">{exec.automationHealth.passRate}%</span></div>
                <div className="flex justify-between"><span>Coverage</span><span className="font-semibold">{exec.automationHealth.coverage}%</span></div>
              </div>
            }
          />
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Pre-Prod Bug Aging</p>
            <AgingBar bugs={exec.preProdBugAgingList} />
          </div>
        </div>
      </QuadrantCard>

      {/* Risk Radar */}
      <QuadrantCard title="Risk Radar" icon={<Users className="w-4 h-4" />}>
        {topRisks.length === 0 ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">All teams stable</p>
        ) : (
          <div className="space-y-1">
            {topRisks.map((t) => (
              <RiskRow key={t.name} risk={t} />
            ))}
          </div>
        )}
      </QuadrantCard>
    </div>
  );
}

function RiskRow({ risk }: { risk: TeamRisk }) {
  const [open, setOpen] = useState(false);
  const levers = verticalLevers(risk);
  return (
    <div
      className="relative flex items-center gap-2 py-1 rounded-md px-1 -mx-1 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${RISK_COLORS[risk.level]}`} />
      <Link
        href={`/verticals/${risk.slug}`}
        className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-1 min-w-0 truncate hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors"
      >
        {risk.name}
      </Link>
      <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">{RISK_LABELS[risk.level]}</span>
      {open && risk.signals.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1.5 z-50 w-64 p-2.5 rounded-lg shadow-lg bg-slate-800 dark:bg-slate-700 text-[11px] text-slate-100 pointer-events-none">
          <p className="font-semibold mb-1.5">{risk.name}</p>
          {risk.signals.map((s, i) => (
            <p key={i} className="py-0.5">• {s}</p>
          ))}
          {levers.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-600/70 dark:border-slate-500/50">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300 mb-1">Improve the grade — reduce</p>
              {levers.map((l, i) => (
                <p key={i} className="py-0.5 text-slate-200">→ {l}</p>
              ))}
            </div>
          )}
          <div className="absolute left-4 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-slate-800 dark:border-t-slate-700" />
        </div>
      )}
    </div>
  );
}

const AGING_BUCKETS = [
  { key: "fresh", label: "< 7d", color: "bg-emerald-500", hex: "#10b981", max: 7 },
  { key: "recent", label: "7-30d", color: "bg-green-400", hex: "#4ade80", max: 30 },
  { key: "aging", label: "30-60d", color: "bg-amber-400", hex: "#fbbf24", max: 60 },
  { key: "stale", label: "60-90d", color: "bg-orange-500", hex: "#f97316", max: 90 },
  { key: "critical", label: "> 90d", color: "bg-red-500", hex: "#ef4444", max: Infinity },
] as const;

function bucketKey(b: LinearBug, now: number): (typeof AGING_BUCKETS)[number]["key"] {
  const days = (now - new Date(b.createdAt).getTime()) / 86_400_000;
  for (const bucket of AGING_BUCKETS) {
    if (days < bucket.max) return bucket.key;
  }
  return "critical";
}

function AgingBar({ bugs }: { bugs: LinearBug[] }) {
  const [modal, setModal] = useState<{ label: string; color: string; items: ModalItem[] } | null>(null);
  const [now] = useState(() => Date.now());

  if (bugs.length === 0) {
    return <p className="text-xs text-slate-400 italic">No open bugs</p>;
  }

  const byBucket: Record<string, LinearBug[]> = {};
  for (const b of bugs) (byBucket[bucketKey(b, now)] ??= []).push(b);

  const segments = AGING_BUCKETS
    .map((s) => ({ ...s, bugs: byBucket[s.key] ?? [] }))
    .filter((s) => s.bugs.length > 0);

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setModal({ label: `Pre-Prod Bug Aging — ${s.label}`, color: s.hex, items: bugsToItems(s.bugs) })}
            className={`${s.color} transition-all hover:opacity-80 cursor-pointer`}
            style={{ width: `${(s.bugs.length / bugs.length) * 100}%` }}
            title={`${s.label}: ${s.bugs.length} — click for tickets`}
            aria-label={`${s.label}: ${s.bugs.length} bugs`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1.5">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setModal({ label: `Pre-Prod Bug Aging — ${s.label}`, color: s.hex, items: bugsToItems(s.bugs) })}
            className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:underline cursor-pointer"
          >
            {s.label}: {s.bugs.length}
          </button>
        ))}
      </div>
      {modal && (
        <DetailModal title={modal.label} color={modal.color} items={modal.items} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
