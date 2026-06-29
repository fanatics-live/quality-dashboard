import { z } from "zod";

const envSchema = z.object({
  LINEAR_API_KEY: z.string().min(1),
  INCIDENT_IO_API_KEY: z.string().optional().default(""),
  QASE_API_KEY: z.string().min(1),
  QASE_PROJECT_CODES: z.string().min(1),
  DASHBOARD_EXCLUDE_TEAMS: z.string().optional().default(""),
  LINEAR_ALL_ISSUES_TEAMS: z.string().optional().default(""),
  DASHBOARD_PERIOD_DAYS: z.string().optional().default("14"),
  DATADOG_API_KEY: z.string().optional().default(""),
  DATADOG_APP_KEY: z.string().optional().default(""),
  DATADOG_SITE: z.string().optional().default("datadoghq.com"),
  DATADOG_SERVICE_NAME: z.string().optional().default("live-api"),
  DATADOG_IOS_SERVICE: z.string().optional().default("live.fanatics.FanaticsLive-Production"),
  DATADOG_ANDROID_SERVICE: z.string().optional().default("android-live"),
  SLACK_BOT_TOKEN: z.string().optional().default(""),
  SLACK_QA_CHANNEL: z.string().optional().default(""),
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
    slackBotToken: parsed.SLACK_BOT_TOKEN || null,
    slackQaChannel: parsed.SLACK_QA_CHANNEL || null,
    datadog: parsed.DATADOG_API_KEY && parsed.DATADOG_APP_KEY
      ? {
          apiKey: parsed.DATADOG_API_KEY,
          appKey: parsed.DATADOG_APP_KEY,
          site: parsed.DATADOG_SITE,
          service: parsed.DATADOG_SERVICE_NAME,
          iosService: parsed.DATADOG_IOS_SERVICE,
          androidService: parsed.DATADOG_ANDROID_SERVICE,
        }
      : null,
  };
}
