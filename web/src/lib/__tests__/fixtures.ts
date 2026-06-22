import type { LinearBug } from "../types";

export function makeBug(overrides: Partial<LinearBug> = {}): LinearBug {
  return {
    id: "bug-1",
    title: "Test bug",
    team: "[Marketplace] Checkout",
    teamKey: "MKT",
    vertical: "Marketplace",
    subteam: "Checkout",
    type: "unknown",
    environment: "Staging",
    severity: "Medium",
    status: "Backlog",
    stateType: "backlog",
    createdAt: "2026-06-01T10:00:00.000Z",
    url: "https://linear.app/test/issue/MKT-1",
    releaseBlocker: false,
    ...overrides,
  };
}
