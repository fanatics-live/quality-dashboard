"use client";

import type { HealthScore } from "@/lib/types";
import { GRADE_CONFIG } from "@/lib/quality/grading";

const RING_SIZE = 140;
const STROKE = 10;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function HealthScoreRing({ score }: { score: HealthScore }) {
  const offset = CIRCUMFERENCE - (score.overall / 100) * CIRCUMFERENCE;
  const config = GRADE_CONFIG[score.grade];

  const strokeColor =
    score.grade === "A" ? "#059669" :
    score.grade === "B" ? "#16a34a" :
    score.grade === "C" ? "#f59e0b" :
    score.grade === "D" ? "#ea580c" :
    "#dc2626";

  return (
    <div className="flex items-center gap-6">
      <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
          <circle
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS}
            fill="none" stroke="currentColor" strokeWidth={STROKE}
            className="text-slate-100 dark:text-slate-700"
          />
          <circle
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS}
            fill="none" stroke={strokeColor} strokeWidth={STROKE}
            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-slate-900 dark:text-slate-100">{score.overall}</span>
          <span className={`text-xs font-bold ${config.text}`}>{score.grade}</span>
        </div>
      </div>
      <div className="space-y-2 text-xs flex-1 min-w-0">
        <SubScoreBar label="Stability" value={score.stability.score} weight={35} />
        <SubScoreBar label="Reliability" value={score.reliability.score} weight={25} />
        <SubScoreBar label="Prevention" value={score.prevention.score} weight={20} />
        <SubScoreBar label="Delivery" value={score.delivery.score} weight={20} />
      </div>
    </div>
  );
}

function SubScoreBar({ label, value, weight }: { label: string; value: number; weight: number }) {
  const color =
    value >= 80 ? "bg-emerald-500" :
    value >= 60 ? "bg-green-500" :
    value >= 40 ? "bg-amber-500" :
    value >= 20 ? "bg-orange-500" :
    "bg-red-500";

  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-slate-600 dark:text-slate-400">{label} <span className="text-slate-400 dark:text-slate-500">({weight}%)</span></span>
        <span className="font-semibold text-slate-700 dark:text-slate-300">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
