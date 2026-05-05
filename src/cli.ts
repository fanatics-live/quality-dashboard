#!/usr/bin/env tsx
import { runCouncil } from "./council.js";
import type { CouncilConfig, ProviderConfig } from "./types.js";
import { getRoleTitle } from "./roles.js";

// ── Load API keys from environment ──

function loadConfig(): CouncilConfig {
  const providers: ProviderConfig[] = [];

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (anthropicKey) {
    providers.push({ name: "anthropic", apiKey: anthropicKey, model: "claude-opus-4-7" });
  }
  if (openaiKey) {
    providers.push({ name: "openai", apiKey: openaiKey, model: "gpt-5.5" });
  }
  if (geminiKey) {
    providers.push({ name: "gemini", apiKey: geminiKey, model: "gemini-2.5-pro" });
  }

  if (providers.length === 0) {
    console.error("No API keys found. Set at least one of:");
    console.error("  ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY");
    process.exit(1);
  }

  if (providers.length < 2) {
    console.warn(`\n  Only ${providers.length} provider configured. Council works best with 2-3 providers.`);
    console.warn("  Missing keys:", [
      !anthropicKey && "ANTHROPIC_API_KEY",
      !openaiKey && "OPENAI_API_KEY",
      !geminiKey && "GEMINI_API_KEY",
    ].filter(Boolean).join(", "));
    console.warn("");
  }

  // Chairman = strongest model available
  const chairman = anthropicKey
    ? { provider: "anthropic" as const, model: "claude-opus-4-7" }
    : openaiKey
      ? { provider: "openai" as const, model: "gpt-5.5" }
      : { provider: "gemini" as const, model: "gemini-2.5-pro" };

  // Auditor = different provider from chairman for independence
  const auditorProvider = providers.find((p) => p.name !== chairman.provider) ?? providers[0];
  const auditor = { provider: auditorProvider.name, model: auditorProvider.model };

  return {
    providers,
    chairman,
    auditor,
    convergenceThreshold: 75,
    maxRounds: 3,
    verbose: true,
  };
}

// ── Pretty Output ──

function divider(title: string) {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

// ── Main ──

async function main() {
  const query = process.argv.slice(2).join(" ");

  if (!query) {
    console.log("Usage: npx tsx src/cli.ts \"your question or task\"");
    console.log("");
    console.log("Examples:");
    console.log('  npx tsx src/cli.ts "Design a notification system for a mobile app"');
    console.log('  npx tsx src/cli.ts "Should we use WebSocket or SSE for live updates?"');
    process.exit(0);
  }

  console.log("\n  LLM Council v0.1.0");
  console.log("  ==================\n");
  console.log(`  Query: ${query}\n`);

  const config = loadConfig();
  console.log(`  Providers: ${config.providers.map((p) => `${p.name}/${p.model}`).join(", ")}`);
  console.log(`  Chairman: ${config.chairman.provider}/${config.chairman.model}`);
  console.log(`  Auditor: ${config.auditor.provider}/${config.auditor.model}`);
  console.log(`  Max rounds: ${config.maxRounds} | Convergence threshold: ${config.convergenceThreshold}%`);
  console.log("");

  const start = Date.now();

  const result = await runCouncil(query, config);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // ── Print Proposals ──
  divider("STAGE 1 — PROPOSALS");
  for (const p of result.proposals) {
    console.log(`\n  [${p.member.label}] ${getRoleTitle(p.member.role)} (${p.member.provider.name}/${p.member.provider.model})`);
    console.log(`  Interpretation: ${p.interpretation || "(embedded in proposal)"}`);
    console.log(`  ---`);
    const preview = (p.content || p.raw).slice(0, 500);
    console.log(`  ${preview}${preview.length >= 500 ? "..." : ""}`);
  }

  // ── Print Challenge Summary ──
  divider("STAGE 2 — PEER REVIEW");
  for (const c of result.challenges) {
    console.log(`\n  [${c.reviewer.label}] ${getRoleTitle(c.reviewer.role)} rankings:`);
    console.log(`    ${c.ranking.join(" > ")}`);
    if (c.convergencePoints) {
      console.log(`    Convergence: ${c.convergencePoints.slice(0, 200)}`);
    }
  }

  // ── Print Convergence ──
  divider(`CONVERGENCE (${result.rounds} round${result.rounds > 1 ? "s" : ""})`);
  console.log(`  Agreement: ${result.convergence.agreementScore}%`);
  console.log(`  Verdict: ${result.convergence.verdict}`);
  if (result.convergence.conflicts !== "none") {
    console.log(`  Remaining conflicts: ${result.convergence.conflicts.slice(0, 300)}`);
  }

  // ── Print Final Answer ──
  divider("STAGE 4 — CHAIRMAN SYNTHESIS");
  console.log(`  Model: ${result.synthesis.model}`);
  console.log(`  Confidence: ${result.synthesis.confidence || "(see below)"}`);
  console.log("");
  console.log(result.synthesis.detail || result.synthesis.raw);

  // ── Print Audit ──
  divider("STAGE 5 — AUDIT");
  console.log(`  Result: ${result.audit.verdict}`);
  console.log(`  Recommendation: ${result.audit.recommendation}`);
  if (result.audit.issues.length > 0) {
    console.log("  Issues:");
    for (const issue of result.audit.issues) {
      console.log(`    - ${issue}`);
    }
  }

  // ── Summary ──
  divider("SUMMARY");
  console.log(`  Total API calls: ${result.totalCalls}`);
  console.log(`  Debate rounds: ${result.rounds}`);
  console.log(`  Agreement reached: ${result.convergence.agreementScore}%`);
  console.log(`  Audit: ${result.audit.verdict} (${result.audit.recommendation})`);
  console.log(`  Time: ${elapsed}s`);
  console.log("");

  // ── Write full result to file ──
  const outPath = "council-result.json";
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(`  Full result written to ${outPath}\n`);
}

main().catch((err) => {
  console.error("\n  Council failed:", err.message ?? err);
  process.exit(1);
});
