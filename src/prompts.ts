import type { CouncilMember, Proposal, Challenge, Revision } from "./types.js";
import { getReviewAddendum } from "./roles.js";

// ── Stage 1: Propose ──

export function buildProposalPrompt(query: string): string {
  return `${query}

Respond with this EXACT structure (keep the headers):

## Interpretation
How you understand the task (1-2 sentences)

## Proposal
Your complete answer

## Confidence Map
For each key claim, mark [HIGH], [MEDIUM], or [LOW]

## Risks & Unknowns
What could go wrong, what you're not sure about`;
}

// ── Stage 2: Challenge ──

export function buildChallengePrompt(
  query: string,
  proposals: Proposal[],
  reviewer: CouncilMember,
): string {
  const proposalsText = proposals
    .map((p) => `Proposal ${p.member.label}:\n${p.raw}`)
    .join("\n\n---\n\n");

  const addendum = getReviewAddendum(reviewer.role);

  return `You are reviewing multiple proposals for the following task.
Your job is adversarial: find flaws, not praise.

${addendum}

Rules:
- Focus on: correctness, completeness, feasibility, hallucination risk.
- If a proposal makes a factual claim you cannot verify, flag it as [UNVERIFIED].
- If proposals contradict each other, identify which is more likely correct and why.
- If ALL proposals agree on something, note it as a convergence point.
- Be specific: quote the exact part you're challenging.
- Do NOT rank based on writing style. Rank on substance only.

Original task: ${query}

---

${proposalsText}

---

For each proposal provide:
1. **Strengths**: What is correct and valuable
2. **Flaws**: What is wrong, missing, or potentially hallucinated
3. **Unverified Claims**: Claims that sound plausible but cannot be confirmed [UNVERIFIED]

Then provide:

## Convergence Points
Claims where ALL proposals agree (likely correct)

## Divergence Points
Claims where proposals disagree (need resolution)

## Final Ranking
Rank proposals from best to worst (substance only):
1. Proposal X — reason
2. Proposal Y — reason
3. Proposal Z — reason
4. Proposal W — reason`;
}

// ── Stage 3: Revise ──

export function buildRevisionPrompt(
  query: string,
  proposal: Proposal,
  challenges: Challenge[],
  convergencePoints: string,
  divergencePoints: string,
): string {
  const critiques = challenges
    .map((c, i) => `Reviewer ${i + 1} critique:\n${c.raw}`)
    .join("\n\n---\n\n");

  return `You are revising your earlier proposal based on peer review feedback.

Rules:
- Accept valid criticism. Change your answer where the critique is correct.
- Defend your position ONLY if you have strong evidence. Explain why.
- If a reviewer flagged something as [UNVERIFIED] and you cannot verify it either, REMOVE that claim.
- Incorporate convergence points — if all reviewers agree, adopt it.
- On divergence points, take a clear position and justify it.
- Do NOT add new claims to compensate for removed ones. Shorter and correct > longer and wrong.
- Mark changes: [REVISED], [DEFENDED], [REMOVED]

Original task: ${query}

Your original proposal:
${proposal.raw}

---

${critiques}

---

Convergence points (all reviewers agreed):
${convergencePoints}

Divergence points (reviewers disagreed):
${divergencePoints}

---

Respond with this EXACT structure:

## Changes Made
List each change with [REVISED], [DEFENDED], or [REMOVED]

## Revised Proposal
Your updated complete answer

## Remaining Uncertainty
What you're still not confident about`;
}

// ── Convergence Check ──

export function buildConvergencePrompt(revisions: Revision[]): string {
  const revisionsText = revisions
    .map((r) => `Revised Proposal ${r.member.label}:\n${r.revisedContent || r.raw}`)
    .join("\n\n---\n\n");

  return `Compare the revised proposals and determine if the council has reached sufficient agreement.

${revisionsText}

Respond with ONLY this structured format (no other text):

AGREEMENT_SCORE: <number 0-100>%
CONFLICTS: <list of remaining conflicts, or "none">
VERDICT: CONVERGED | NEEDS_ANOTHER_ROUND
FOCUS: <question for next round, or "n/a">`;
}

// ── Stage 4: Chairman Synthesis ──

export function buildSynthesisPrompt(
  query: string,
  revisions: Revision[],
  convergencePoints: string,
  divergencePoints: string,
  aggregateRanking: string,
): string {
  const revisionsText = revisions
    .map((r) => `${r.member.label} (${r.member.role}):\n${r.revisedContent || r.raw}`)
    .join("\n\n---\n\n");

  return `You are the Chairman of an expert council. Four specialists have debated and revised their proposals through multiple rounds. You will see their final revised proposals.

Your role is to produce the DEFINITIVE answer.

Rules:
- Build your answer primarily from convergence points — claims ALL members agreed on.
- For divergence points, side with the majority OR the best-justified position. Explain why.
- REMOVE any claim flagged [UNVERIFIED] by 2+ reviewers and not defended.
- Do NOT introduce new information that wasn't in any proposal. You are a synthesizer, not a new contributor.
- If the council could not resolve a point, say so explicitly.
- The final answer must be self-contained — the user will only see this output.
- Quality over quantity. Every sentence must earn its place.

Original task: ${query}

--- FINAL REVISED PROPOSALS ---

${revisionsText}

--- COUNCIL SUMMARY ---

Convergence points:
${convergencePoints}

Unresolved divergences:
${divergencePoints}

Aggregate ranking (by peer vote):
${aggregateRanking}

---

Respond with this EXACT structure:

## Executive Summary
2-3 sentences

## Detailed Answer
The complete, definitive response

## Confidence Level
HIGH / MEDIUM / LOW with justification

## Caveats
Anything the user should verify independently`;
}

// ── Stage 5: Audit ──

export function buildAuditPrompt(
  synthesis: string,
  revisions: Revision[],
  unverifiedFlags: string,
): string {
  const sourcesText = revisions
    .map((r) => `${r.member.label} (${r.member.role}):\n${r.revisedContent || r.raw}`)
    .join("\n\n---\n\n");

  return `You are a fact-checker and hallucination detector. You will receive a final synthesized answer and the source proposals it was built from.

Your ONLY job is to catch errors. You are not improving the answer.

Rules:
- For each factual claim in the final answer, check if it appears in at least one source proposal.
- If a claim appears in the final answer but NOT in any source, flag it as [INJECTED].
- If a claim was flagged [UNVERIFIED] but still appears, flag it as [UNVERIFIED_KEPT].
- If numbers, dates, or API signatures appear, verify consistency across sources.
- Do NOT evaluate quality or style. Only check factual integrity.

Final answer to audit:
${synthesis}

---

Source proposals:
${sourcesText}

---

Unverified flags from peer review:
${unverifiedFlags}

---

Respond with ONLY this structured format:

AUDIT_RESULT: CLEAN | HAS_ISSUES
ISSUES:
- [INJECTED]: "exact quote" — not found in any source
- [UNVERIFIED_KEPT]: "exact quote" — was flagged, still present
- [INCONSISTENT]: "exact quote" — contradicts source
RECOMMENDATION: APPROVE | REVISE`;
}
