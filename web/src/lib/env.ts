import { z } from "zod";

const envSchema = z.object({
  LINEAR_API_KEY: z.string().min(1),
  INCIDENT_IO_API_KEY: z.string().optional().default(""),
  QASE_API_KEY: z.string().min(1),
  QASE_PROJECT_CODES: z.string().min(1),
  DASHBOARD_EXCLUDE_TEAMS: z.string().optional().default(""),
  LINEAR_ALL_ISSUES_TEAMS: z.string().optional().default(""),
  DASHBOARD_PERIOD_DAYS: z.string().optional().default("7"),
});

export function getEnv() {
  const parsed = envSchema.parse(process.env);
  return {
    linearApiKey: parsed.LINEAR_API_KEY,
    incidentApiKey: parsed.INCIDENT_IO_API_KEY || null,
    qaseApiKey: parsed.QASE_API_KEY,
    qaseProjectCodes: parsed.QASE_PROJECT_CODES.split(",").map((c) => c.trim()).filter(Boolean),
    excludeTeams: parsed.DASHBOARD_EXCLUDE_TEAMS.split(",").map((t) => t.trim()).filter(Boolean),
    allIssuesTeams: parsed.LINEAR_ALL_ISSUES_TEAMS.split(",").map((t) => t.trim()).filter(Boolean),
    periodDays: parseInt(parsed.DASHBOARD_PERIOD_DAYS, 10),
  };
}
