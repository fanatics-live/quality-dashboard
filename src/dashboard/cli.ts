#!/usr/bin/env tsx
import "dotenv/config";
import { createServer } from "node:http";
import { collectDashboardData } from "./collector.js";
import { buildCouncilQuery } from "./council-query.js";
import { generateHtmlReport } from "./report.js";
import { runCouncil } from "../council.js";
import type { DashboardConfig, DashboardData } from "./types.js";
import type { CouncilConfig, CouncilResult, ProviderConfig } from "../types.js";
import { writeFile } from "node:fs/promises";

function loadDashboardConfig(): DashboardConfig {
  const linearKey = process.env.LINEAR_API_KEY;
  const incidentKey = process.env.INCIDENT_IO_API_KEY;
  const qaseKey = process.env.QASE_API_KEY;

  const missing: string[] = [];
  if (!linearKey) missing.push("LINEAR_API_KEY");
  if (!qaseKey) missing.push("QASE_API_KEY");

  if (missing.length > 0) {
    console.error("Missing required API keys:");
    for (const k of missing) console.error(`  - ${k}`);
    process.exit(1);
  }

  if (!incidentKey) {
    console.warn("  ⚠ INCIDENT_IO_API_KEY not set — incident metrics will be skipped.\n");
  }

  const teamFilter = process.env.DASHBOARD_TEAMS?.split(",").map((t) => t.trim()).filter(Boolean);
  const projectCodes = (process.env.QASE_PROJECT_CODES ?? "").split(",").map((c) => c.trim()).filter(Boolean);

  if (projectCodes.length === 0) {
    console.error("Set QASE_PROJECT_CODES (comma-separated project codes, e.g. 'PROJ1,PROJ2')");
    process.exit(1);
  }

  const excludeTeams = (process.env.DASHBOARD_EXCLUDE_TEAMS ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const allIssuesTeams = (process.env.LINEAR_ALL_ISSUES_TEAMS ?? "").split(",").map((t) => t.trim()).filter(Boolean);

  return {
    linear: {
      apiKey: linearKey!,
      teamFilter: teamFilter?.length ? teamFilter : undefined,
      excludeTeams: excludeTeams.length ? excludeTeams : undefined,
      allIssuesTeams: allIssuesTeams.length ? allIssuesTeams : undefined,
      bugLabelRegression: process.env.LINEAR_LABEL_REGRESSION ?? "regression",
      bugLabelProgression: process.env.LINEAR_LABEL_PROGRESSION ?? "progression",
    },
    incident: incidentKey ? { apiKey: incidentKey } : null,
    qase: { apiKey: qaseKey!, projectCodes },
    periodDays: parseInt(process.env.DASHBOARD_PERIOD_DAYS ?? "7", 10),
  };
}

function loadCouncilConfig(): CouncilConfig | null {
  const providers: ProviderConfig[] = [];

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (anthropicKey) providers.push({ name: "anthropic", apiKey: anthropicKey, model: "claude-opus-4-7" });
  if (openaiKey) providers.push({ name: "openai", apiKey: openaiKey, model: "gpt-5.5" });
  if (geminiKey) providers.push({ name: "gemini", apiKey: geminiKey, model: "gemini-2.5-pro" });

  if (providers.length === 0) return null;

  const chairman = anthropicKey
    ? { provider: "anthropic" as const, model: "claude-opus-4-7" }
    : openaiKey
      ? { provider: "openai" as const, model: "gpt-5.5" }
      : { provider: "gemini" as const, model: "gemini-2.5-pro" };

  const auditorProvider = providers.find((p) => p.name !== chairman.provider) ?? providers[0];

  return {
    providers,
    chairman,
    auditor: { provider: auditorProvider.name, model: auditorProvider.model },
    convergenceThreshold: 75,
    maxRounds: 2,
    verbose: true,
  };
}

function divider(title: string) {
  const line = "═".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

async function buildReport(skipCouncil: boolean): Promise<string> {
  divider("DATA COLLECTION");
  const dashConfig = loadDashboardConfig();
  const data = await collectDashboardData(dashConfig);

  console.log(`  Bugs: ${data.bugs.total} (${data.bugs.open} open)`);
  console.log(`    Regressions: ${data.bugs.byType.regression} | Progressions: ${data.bugs.byType.progression}`);

  let councilResult: CouncilResult | null = null;
  if (!skipCouncil) {
    const councilConfig = loadCouncilConfig();
    if (councilConfig) {
      divider("COUNCIL ANALYSIS");
      const query = buildCouncilQuery(data);
      const start = Date.now();
      councilResult = await runCouncil(query, councilConfig);
      console.log(`  Council completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    }
  }

  return generateHtmlReport(data, councilResult);
}

async function startServer(port: number, skipCouncil: boolean) {
  console.log("\n  Quality Dashboard v1.0.0");
  console.log("  ========================\n");
  console.log(`  Building initial report...\n`);

  let html = await buildReport(skipCouncil);

  const server = createServer((req, res) => {
    if (req.url === "/refresh") {
      console.log("\n  Refreshing data...");
      buildReport(skipCouncil)
        .then((newHtml) => {
          html = newHtml;
          res.writeHead(302, { Location: "/" });
          res.end();
          console.log("  Refresh complete.\n");
        })
        .catch((err) => {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(`Refresh failed: ${err.message}`);
        });
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  server.listen(port, () => {
    divider("SERVER RUNNING");
    console.log(`  http://localhost:${port}`);
    console.log(`  http://localhost:${port}/refresh  ← force reload data\n`);
  });
}

async function main() {
  const skipCouncil = process.argv.includes("--no-council");
  const serve = process.argv.includes("--serve");
  const port = parseInt(process.argv.find((a) => a.startsWith("--port="))?.split("=")[1] ?? "3000", 10);
  const outputPath = process.argv.find((a) => a.startsWith("--output="))?.split("=")[1] ?? "quality-report.html";

  if (serve) {
    await startServer(port, skipCouncil);
    return;
  }

  console.log("\n  Quality Dashboard v1.0.0");
  console.log("  ========================\n");

  const html = await buildReport(skipCouncil);

  divider("REPORT GENERATION");
  await writeFile(outputPath, html);
  console.log(`  Report written to ${outputPath}`);

  divider("DONE");
  console.log(`  Open ${outputPath} in your browser to view the report.\n`);
}

main().catch((err) => {
  console.error("\n  Dashboard failed:", err.message ?? err);
  process.exit(1);
});
