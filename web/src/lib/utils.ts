import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Linear priority is a number: 0 = none, 1 = urgent, 2 = high, 3 = medium, 4 = low.
const PRIORITY_LABELS: Record<number, string> = {
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

export function priorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? "—";
}

// Sort key: most urgent first. Linear orders 0 (none) last despite the low number.
export function priorityRank(priority: number): number {
  return priority === 0 ? 99 : priority;
}

const SEVERITY_RANK: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export function severityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? 99;
}
