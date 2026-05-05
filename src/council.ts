import type {
  CouncilConfig,
  CouncilMember,
  CouncilResult,
  Proposal,
  Challenge,
  Revision,
  ConvergenceResult,
  Synthesis,
  AuditResult,
} from "./types.js";
import { query as queryProvider, queryParallelDistinct } from "./providers.js";
import { createMembers, getRoleTitle } from "./roles.js";
import {
  buildProposalPrompt,
  buildChallengePrompt,
  buildRevisionPrompt,
  buildConvergencePrompt,
  buildSynthesisPrompt,
  buildAuditPrompt,
} from "./prompts.js";

type Logger = (stage: string, message: string) => void;

let totalCalls = 0;

function log(verbose: boolean, logger: Logger, stage: string, msg: string) {
  if (verbose) logger(stage, msg);
}

// ── Parsing Helpers ──

function extractSection(text: string, header: string): string {
  const regex = new RegExp(`## ${header}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim() ?? "";
}

function extractConvergence(text: string): ConvergenceResult {
  const scoreMatch = text.match(/AGREEMENT_SCORE:\s*(\d+)/);
  const conflictsMatch = text.match(/CONFLICTS:\s*(.*?)(?=\nVERDICT:)/s);
  const verdictMatch = text.match(/VERDICT:\s*(CONVERGED|NEEDS_ANOTHER_ROUND)/);
  const focusMatch = text.match(/FOCUS:\s*(.*)/);

  return {
    agreementScore: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
    conflicts: conflictsMatch?.[1]?.trim() ?? "unknown",
    verdict: verdictMatch?.[1] as "CONVERGED" | "NEEDS_ANOTHER_ROUND" ?? "NEEDS_ANOTHER_ROUND",
    focus: focusMatch?.[1]?.trim() ?? "",
    raw: text,
  };
}

function extractAudit(text: string): AuditResult {
  const resultMatch = text.match(/AUDIT_RESULT:\s*(CLEAN|HAS_ISSUES)/);
  const issuesSection = text.match(/ISSUES:\s*([\s\S]*?)(?=\nRECOMMENDATION:)/);
  const recMatch = text.match(/RECOMMENDATION:\s*(APPROVE|REVISE)/);

  const issues: string[] = [];
  if (issuesSection?.[1]) {
    const lines = issuesSection[1].split("\n").filter((l) => l.trim().startsWith("-"));
    issues.push(...lines.map((l) => l.trim().replace(/^-\s*/, "")));
  }

  return {
    verdict: (resultMatch?.[1] as "CLEAN" | "HAS_ISSUES") ?? "HAS_ISSUES",
    issues,
    recommendation: (recMatch?.[1] as "APPROVE" | "REVISE") ?? "REVISE",
    raw: text,
  };
}

function collectConvergenceDivergence(challenges: Challenge[]): { convergence: string; divergence: string } {
  const convergencePoints: string[] = [];
  const divergencePoints: string[] = [];

  for (const c of challenges) {
    if (c.convergencePoints) convergencePoints.push(c.convergencePoints);
    if (c.divergencePoints) divergencePoints.push(c.divergencePoints);
  }

  return {
    convergence: convergencePoints.join("\n\n") || "None identified",
    divergence: divergencePoints.join("\n\n") || "None identified",
  };
}

function collectUnverifiedFlags(challenges: Challenge[]): string {
  const flags: string[] = [];
  for (const c of challenges) {
    for (const r of c.reviews) {
      if (r.unverified) flags.push(r.unverified);
    }
  }
  return flags.join("\n") || "None flagged";
}

function buildAggregateRanking(challenges: Challenge[], members: CouncilMember[]): string {
  const scores = new Map<string, number[]>();
  for (const m of members) scores.set(m.label, []);

  for (const c of challenges) {
    c.ranking.forEach((label, position) => {
      const existing = scores.get(label);
      if (existing) existing.push(position + 1);
    });
  }

  const ranked = Array.from(scores.entries())
    .map(([label, positions]) => ({
      label,
      avg: positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : 99,
      member: members.find((m) => m.label === label),
    }))
    .sort((a, b) => a.avg - b.avg);

  return ranked
    .map((r, i) => `${i + 1}. ${r.label} (${r.member?.role ?? "unknown"}) — avg rank ${r.avg.toFixed(1)}`)
    .join("\n");
}

function parseRanking(raw: string, memberLabels: string[]): string[] {
  const section = raw.split("## Final Ranking")[1] ?? raw.split("FINAL RANKING")[1] ?? raw;
  const ranking: string[] = [];

  for (const label of memberLabels) {
    const idx = section.indexOf(label);
    if (idx >= 0) ranking.push(label);
  }

  // If parsing failed, return all labels in order (no bias)
  return ranking.length > 0 ? ranking : memberLabels;
}

// ── Stage Implementations ──

async function stage1Propose(
  members: CouncilMember[],
  query: string,
  verbose: boolean,
  logger: Logger,
): Promise<Proposal[]> {
  log(verbose, logger, "STAGE 1", `Collecting proposals from ${members.length} members...`);

  const calls = members.map((m) => ({
    config: m.provider,
    messages: [
      { role: "system" as const, content: m.systemPrompt },
      { role: "user" as const, content: buildProposalPrompt(query) },
    ],
  }));

  const results = await queryParallelDistinct(calls);
  totalCalls += members.length;

  const proposals: Proposal[] = [];
  for (let i = 0; i < members.length; i++) {
    const r = results[i];
    if (!r) {
      log(verbose, logger, "STAGE 1", `${members[i].label} (${members[i].role}) FAILED — skipping`);
      continue;
    }

    log(verbose, logger, "STAGE 1", `${members[i].label} (${getRoleTitle(members[i].role)}) responded in ${r.durationMs}ms [${r.provider}/${r.model}]`);

    proposals.push({
      member: members[i],
      interpretation: extractSection(r.content, "Interpretation"),
      content: extractSection(r.content, "Proposal"),
      confidenceMap: extractSection(r.content, "Confidence Map"),
      risks: extractSection(r.content, "Risks & Unknowns"),
      raw: r.content,
    });
  }

  return proposals;
}

async function stage2Challenge(
  members: CouncilMember[],
  proposals: Proposal[],
  query: string,
  verbose: boolean,
  logger: Logger,
): Promise<Challenge[]> {
  log(verbose, logger, "STAGE 2", `${members.length} members reviewing each other's proposals...`);

  const memberLabels = proposals.map((p) => p.member.label);

  const calls = members.map((m) => ({
    config: m.provider,
    messages: [
      { role: "system" as const, content: m.systemPrompt + "\n\nYou are now in REVIEW mode." },
      { role: "user" as const, content: buildChallengePrompt(query, proposals, m) },
    ],
  }));

  const results = await queryParallelDistinct(calls);
  totalCalls += members.length;

  const challenges: Challenge[] = [];
  for (let i = 0; i < members.length; i++) {
    const r = results[i];
    if (!r) {
      log(verbose, logger, "STAGE 2", `${members[i].label} review FAILED — skipping`);
      continue;
    }

    log(verbose, logger, "STAGE 2", `${members[i].label} (${getRoleTitle(members[i].role)}) reviewed in ${r.durationMs}ms`);

    challenges.push({
      reviewer: members[i],
      reviews: proposals.map((p) => ({
        label: p.member.label,
        strengths: "", // extracted from raw if needed
        flaws: "",
        unverified: "",
      })),
      convergencePoints: extractSection(r.content, "Convergence Points"),
      divergencePoints: extractSection(r.content, "Divergence Points"),
      ranking: parseRanking(r.content, memberLabels),
      raw: r.content,
    });
  }

  return challenges;
}

async function stage3Revise(
  proposals: Proposal[],
  challenges: Challenge[],
  query: string,
  convergence: string,
  divergence: string,
  verbose: boolean,
  logger: Logger,
): Promise<Revision[]> {
  log(verbose, logger, "STAGE 3", `${proposals.length} members revising based on peer feedback...`);

  const calls = proposals.map((p) => ({
    config: p.member.provider,
    messages: [
      { role: "system" as const, content: p.member.systemPrompt + "\n\nYou are now in REVISION mode." },
      { role: "user" as const, content: buildRevisionPrompt(query, p, challenges, convergence, divergence) },
    ],
  }));

  const results = await queryParallelDistinct(calls);
  totalCalls += proposals.length;

  const revisions: Revision[] = [];
  for (let i = 0; i < proposals.length; i++) {
    const r = results[i];
    if (!r) {
      log(verbose, logger, "STAGE 3", `${proposals[i].member.label} revision FAILED — using original`);
      revisions.push({
        member: proposals[i].member,
        changes: "FAILED — original proposal used",
        revisedContent: proposals[i].raw,
        remainingUncertainty: "",
        raw: proposals[i].raw,
      });
      continue;
    }

    log(verbose, logger, "STAGE 3", `${proposals[i].member.label} revised in ${r.durationMs}ms`);

    revisions.push({
      member: proposals[i].member,
      changes: extractSection(r.content, "Changes Made"),
      revisedContent: extractSection(r.content, "Revised Proposal"),
      remainingUncertainty: extractSection(r.content, "Remaining Uncertainty"),
      raw: r.content,
    });
  }

  return revisions;
}

async function checkConvergence(
  revisions: Revision[],
  config: CouncilConfig,
  verbose: boolean,
  logger: Logger,
): Promise<ConvergenceResult> {
  log(verbose, logger, "CONVERGENCE", "Checking agreement level...");

  // Use the chairman's provider for convergence check
  const chairmanProvider = config.providers.find((p) => p.name === config.chairman.provider)!;
  const chairmanConfig = { ...chairmanProvider, model: config.chairman.model };

  const result = await queryProvider(chairmanConfig, [
    { role: "system", content: "You are a neutral convergence evaluator. Be precise and structured." },
    { role: "user", content: buildConvergencePrompt(revisions) },
  ]);
  totalCalls++;

  const convergence = extractConvergence(result.content);
  log(verbose, logger, "CONVERGENCE", `Agreement: ${convergence.agreementScore}% — ${convergence.verdict}`);

  if (convergence.verdict === "NEEDS_ANOTHER_ROUND") {
    log(verbose, logger, "CONVERGENCE", `Focus for next round: ${convergence.focus}`);
  }

  return convergence;
}

async function stage4Synthesize(
  revisions: Revision[],
  challenges: Challenge[],
  members: CouncilMember[],
  query: string,
  config: CouncilConfig,
  verbose: boolean,
  logger: Logger,
): Promise<Synthesis> {
  log(verbose, logger, "STAGE 4", `Chairman synthesizing final answer...`);

  const { convergence, divergence } = collectConvergenceDivergence(challenges);
  const aggregateRanking = buildAggregateRanking(challenges, members);

  const chairmanProvider = config.providers.find((p) => p.name === config.chairman.provider)!;
  const chairmanConfig = { ...chairmanProvider, model: config.chairman.model };

  const result = await queryProvider(chairmanConfig, [
    { role: "system", content: "You are the Chairman of an expert council. Synthesize with precision. Never add information that wasn't in the proposals." },
    { role: "user", content: buildSynthesisPrompt(query, revisions, convergence, divergence, aggregateRanking) },
  ]);
  totalCalls++;

  log(verbose, logger, "STAGE 4", `Chairman responded in ${result.durationMs}ms [${result.provider}/${result.model}]`);

  return {
    model: `${result.provider}/${result.model}`,
    summary: extractSection(result.content, "Executive Summary"),
    detail: extractSection(result.content, "Detailed Answer"),
    confidence: extractSection(result.content, "Confidence Level"),
    caveats: extractSection(result.content, "Caveats"),
    raw: result.content,
  };
}

async function stage5Audit(
  synthesis: Synthesis,
  revisions: Revision[],
  challenges: Challenge[],
  config: CouncilConfig,
  verbose: boolean,
  logger: Logger,
): Promise<AuditResult> {
  log(verbose, logger, "STAGE 5", `Auditing for hallucinations...`);

  const unverifiedFlags = collectUnverifiedFlags(challenges);
  const auditorProvider = config.providers.find((p) => p.name === config.auditor.provider)!;
  const auditorConfig = { ...auditorProvider, model: config.auditor.model };

  const result = await queryProvider(auditorConfig, [
    { role: "system", content: "You are a strict fact-checker. Your ONLY job is to catch errors. Never add commentary." },
    { role: "user", content: buildAuditPrompt(synthesis.raw, revisions, unverifiedFlags) },
  ]);
  totalCalls++;

  const audit = extractAudit(result.content);
  log(verbose, logger, "STAGE 5", `Audit: ${audit.verdict} — ${audit.recommendation} (${audit.issues.length} issues)`);

  return audit;
}

// ── Main Entry Point ──

export async function runCouncil(
  userQuery: string,
  config: CouncilConfig,
  logger: Logger = (stage, msg) => console.log(`  [${stage}] ${msg}`),
): Promise<CouncilResult> {
  totalCalls = 0;

  const members = createMembers(config.providers);
  let round = 0;

  // Stage 1: Propose
  const proposals = await stage1Propose(members, userQuery, config.verbose, logger);

  if (proposals.length < 2) {
    throw new Error(`Only ${proposals.length} proposal(s) succeeded — need at least 2 for a council`);
  }

  // Stage 2: Challenge
  const challenges = await stage2Challenge(members, proposals, userQuery, config.verbose, logger);
  const { convergence: convPoints, divergence: divPoints } = collectConvergenceDivergence(challenges);

  // Stage 3: Revise (loop until convergence)
  let revisions = await stage3Revise(proposals, challenges, userQuery, convPoints, divPoints, config.verbose, logger);
  round++;

  let convergenceResult = await checkConvergence(revisions, config, config.verbose, logger);

  while (
    convergenceResult.verdict === "NEEDS_ANOTHER_ROUND" &&
    round < config.maxRounds
  ) {
    log(config.verbose, logger, "LOOP", `Round ${round + 1}/${config.maxRounds} — re-revising with focus: ${convergenceResult.focus}`);

    // Build focused challenges for next round
    const focusedChallenges: Challenge[] = challenges.map((c) => ({
      ...c,
      convergencePoints: convPoints,
      divergencePoints: `FOCUS: ${convergenceResult.focus}\n\n${divPoints}`,
    }));

    revisions = await stage3Revise(
      // Use revisions as "proposals" for next round
      revisions.map((r) => ({
        ...proposals.find((p) => p.member.label === r.member.label)!,
        raw: r.revisedContent || r.raw,
        content: r.revisedContent || r.raw,
      })),
      focusedChallenges,
      userQuery,
      convPoints,
      `FOCUS: ${convergenceResult.focus}\n\n${divPoints}`,
      config.verbose,
      logger,
    );
    round++;

    convergenceResult = await checkConvergence(revisions, config, config.verbose, logger);
  }

  if (convergenceResult.verdict !== "CONVERGED") {
    log(config.verbose, logger, "LOOP", `Max rounds reached (${config.maxRounds}). Proceeding with ${convergenceResult.agreementScore}% agreement.`);
  }

  // Stage 4: Synthesize
  const synthesis = await stage4Synthesize(revisions, challenges, members, userQuery, config, config.verbose, logger);

  // Stage 5: Audit
  const audit = await stage5Audit(synthesis, revisions, challenges, config, config.verbose, logger);

  return {
    query: userQuery,
    proposals,
    challenges,
    revisionRounds: [revisions], // simplified — could track all rounds
    convergence: convergenceResult,
    synthesis,
    audit,
    rounds: round,
    totalCalls,
  };
}
