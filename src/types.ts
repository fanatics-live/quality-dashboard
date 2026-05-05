// ── Core Types ──

export type ProviderName = "anthropic" | "openai" | "gemini";

export interface ProviderConfig {
  name: ProviderName;
  apiKey: string;
  model: string;
}

export interface CouncilConfig {
  providers: ProviderConfig[];
  chairman: { provider: ProviderName; model: string };
  auditor: { provider: ProviderName; model: string };
  convergenceThreshold: number; // 0-100, default 75
  maxRounds: number;            // default 3
  verbose: boolean;
}

export type RoleName = "ux-designer" | "product-manager" | "qa-engineer" | "software-engineer";

export interface CouncilMember {
  role: RoleName;
  label: string; // "Member A", "Member B", etc.
  provider: ProviderConfig;
  systemPrompt: string;
}

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

// ── Stage Results ──

export interface Proposal {
  member: CouncilMember;
  interpretation: string;
  content: string;
  confidenceMap: string;
  risks: string;
  raw: string;
}

export interface Challenge {
  reviewer: CouncilMember;
  reviews: { label: string; strengths: string; flaws: string; unverified: string }[];
  convergencePoints: string;
  divergencePoints: string;
  ranking: string[];
  raw: string;
}

export interface Revision {
  member: CouncilMember;
  changes: string;
  revisedContent: string;
  remainingUncertainty: string;
  raw: string;
}

export interface ConvergenceResult {
  agreementScore: number;
  conflicts: string;
  verdict: "CONVERGED" | "NEEDS_ANOTHER_ROUND";
  focus: string;
  raw: string;
}

export interface Synthesis {
  model: string;
  summary: string;
  detail: string;
  confidence: string;
  caveats: string;
  raw: string;
}

export interface AuditResult {
  verdict: "CLEAN" | "HAS_ISSUES";
  issues: string[];
  recommendation: "APPROVE" | "REVISE";
  raw: string;
}

export interface CouncilResult {
  query: string;
  proposals: Proposal[];
  challenges: Challenge[];
  revisionRounds: Revision[][];
  convergence: ConvergenceResult;
  synthesis: Synthesis;
  audit: AuditResult;
  rounds: number;
  totalCalls: number;
}
