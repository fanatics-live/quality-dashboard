import type { Grade } from "../types";

export function qualityGrade(s: { total: number; open: number; regression: number }): Grade {
  if (s.total === 0) return "A";
  const openRatio = s.open / Math.max(s.total, 1);
  const regrRatio = s.regression / Math.max(s.total, 1);
  const raw = 100
    - openRatio * 40
    - regrRatio * 30
    - Math.min(s.total / 20, 1) * 30;
  if (raw >= 80) return "A";
  if (raw >= 60) return "B";
  if (raw >= 40) return "C";
  if (raw >= 20) return "D";
  return "E";
}

export const GRADE_CONFIG: Record<Grade, { bg: string; text: string; ring: string }> = {
  A: { bg: "bg-emerald-600", text: "text-emerald-600", ring: "ring-emerald-200" },
  B: { bg: "bg-green-600", text: "text-green-600", ring: "ring-green-200" },
  C: { bg: "bg-amber-500", text: "text-amber-500", ring: "ring-amber-200" },
  D: { bg: "bg-orange-600", text: "text-orange-600", ring: "ring-orange-200" },
  E: { bg: "bg-red-600", text: "text-red-600", ring: "ring-red-200" },
};
