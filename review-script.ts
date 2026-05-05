import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!anthropicKey) {
  console.error("Missing ANTHROPIC_API_KEY");
  process.exit(1);
}
if (!openaiKey) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: anthropicKey });
const openai = new OpenAI({ apiKey: openaiKey });

const DESIGNER_PROMPT = `You are a Senior UX/UI Designer reviewing the Magenta Studio UI improvements. Review these changes and provide specific feedback:

UI CHANGES IMPLEMENTED:
1. Activity Bar Layout - Left sidebar with 6 tab navigation (Live, Inspect, Record, Run, Results, Heal) using VS Code pattern
2. Enhanced ElementInspector - Hierarchy breadcrumb (clickable parent chain), ranked selector list (best/good/fragile), action buttons (Tap, Long Press, Add to Recorder)
3. ActionRecorder - Added JSON export format, clipboard fallback for HTTP, maintained TS/YAML modes
4. RunPanel - Test execution UI with shard status grid, step progress list, filter input, run/stop button
5. ResultsPanel - Summary stats (total/passed/failed), filter by status, test result list with durations and heal counts
6. HealPanel - Heal review with strategy badges (fuzzy/llm/cached), selector diff (before/after), promote to locators.ts button, copy selector button

Design review checklist:
- Information architecture: Is the activity bar navigation intuitive?
- Visual hierarchy: Are the important elements prominent enough?
- Interaction patterns: Are gestures and click targets clear?
- Consistency: Do new components match existing design language?
- Missing UX: What interactions are missing or could be improved?
- Accessibility: Any keyboard navigation gaps?

Provide specific, actionable feedback. Reference component names.`;

const QA_PROMPT = `You are a Senior QA Engineer & Automation Specialist reviewing framework improvements. Review these implementations and provide testing feedback:

BACKEND IMPLEMENTATIONS:
1. RingBuffer<T> (packages/core/src/utils/ring-buffer.ts) - Fixed-capacity buffer, drops oldest on overflow
2. DeviceRegistry (packages/studio/src/server/device-registry.ts) - Replaces singleton with Map + pending dedup
3. Zod Schemas (packages/core/src/ios/schemas/) - IdbElementSchema, SimctlDeviceSchema for iOS validation
4. DeviceStreamSession (packages/studio/src/server/ws/device-stream-session.ts) - WS backpressure, 3-frame queue, bufferedAmount check
5. HealingLogger (packages/core/src/heal/healing-logger.ts) - Buffered NDJSON, 500-entry cap, periodic flush, error recovery
6. ShardStateMachine (packages/core/src/runner/shard-state-machine.ts) - Formal state machine, external crash counter, transition table
7. StepContext/withStep (packages/core/src/runner/step-context.ts) - AsyncLocalStorage step context, replaces console.log parsing
8. TestRegistry (scripts/config/test-registry.yaml + .ts) - Zod-validated YAML metadata, 20 test entries
9. FixtureFactory (packages/core/src/runner/fixture-factory.ts) - Per-shard unique data generation
10. Metrics endpoint (packages/studio/src/server/api/metrics.ts) - JSON /api/metrics with counters

UI IMPLEMENTATIONS:
11. Activity Bar + App.tsx restructure - 6-tab navigation, activity bar component
12. Enhanced ElementInspector - Hierarchy, ranked selectors, actions
13. ActionRecorder - JSON export, clipboard fallback
14. RunPanel - Shard grid, step progress, WS events
15. ResultsPanel - Summary stats, filtered list
16. HealPanel - Strategy filter, selector diff, promote button

QA review checklist:
- Edge cases: What could break under stress or unexpected input?
- Race conditions: Any async timing issues?
- Memory leaks: Any unbounded growth?
- Error handling: Are failures handled gracefully?
- Test coverage: What unit tests should be written?
- Integration risks: What could break existing functionality?

Provide specific, prioritized findings. Use format: [CRITICAL/HIGH/MEDIUM/LOW] finding description.`;

async function runDesignerReview(): Promise<string> {
  console.log(">>> Starting Designer Review (claude-sonnet-4-6)...\n");
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: DESIGNER_PROMPT }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  console.log(">>> Designer Review complete.\n");
  return text;
}

async function runQAReview(): Promise<string> {
  console.log(">>> Starting QA Review (gpt-4.1)...\n");
  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_tokens: 4096,
    messages: [{ role: "user", content: QA_PROMPT }],
  });

  const text = response.choices[0]?.message?.content ?? "(no response)";
  console.log(">>> QA Review complete.\n");
  return text;
}

async function main() {
  console.log("=== Magenta Council: Implementation Review ===\n");
  console.log("Running two parallel reviews...\n");

  const [designerReview, qaReview] = await Promise.all([
    runDesignerReview(),
    runQAReview(),
  ]);

  // Print to stdout
  console.log("\n" + "=".repeat(80));
  console.log("DESIGNER REVIEW (claude-sonnet-4-6 — Senior UX/UI Designer)");
  console.log("=".repeat(80) + "\n");
  console.log(designerReview);

  console.log("\n" + "=".repeat(80));
  console.log("QA REVIEW (gpt-4.1 — Senior QA Engineer)");
  console.log("=".repeat(80) + "\n");
  console.log(qaReview);

  // Write combined review to file
  const now = new Date().toISOString();
  const report = `# Magenta Framework — Implementation Review

> Generated: ${now}
> Council members: claude-sonnet-4-6 (Designer), gpt-4.1 (QA Engineer)

---

## Designer Review (claude-sonnet-4-6 — Senior UX/UI Designer)

${designerReview}

---

## QA Review (gpt-4.1 — Senior QA Engineer)

${qaReview}

---

*Review generated by Magenta Council review-script.ts*
`;

  const fs = await import("fs");
  const outPath = new URL("./IMPLEMENTATION_REVIEW.md", import.meta.url);
  fs.writeFileSync(outPath, report, "utf-8");
  console.log(`\n>>> Review written to IMPLEMENTATION_REVIEW.md`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
