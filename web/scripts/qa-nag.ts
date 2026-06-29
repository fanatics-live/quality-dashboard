/**
 * QA label-hygiene digest. Fetches open bugs from Linear, finds the ones
 * missing a mandatory label (Bug type / Severity / Environment) in a
 * QA-owned vertical, and posts a grouped digest to Slack.
 *
 * Run a preview (posts to QA-central): npx tsx scripts/qa-nag.ts --dry-run
 * Run for real (posts to QA channel):  npx tsx scripts/qa-nag.ts
 *
 * Env: LINEAR_API_KEY, SLACK_BOT_TOKEN, SLACK_QA_CHANNEL,
 *      LINEAR_ALL_ISSUES_TEAMS (optional), QA_NAG_DAYS (optional, default 60).
 */
import { fetchLinearBugs } from "../src/lib/integrations/linear";
import { buildDigest } from "../src/lib/slack/qa-nag";
import { postMessage } from "../src/lib/slack/client";

// Preview destination: the digest goes here for review instead of nagging the
// real QA channel (SLACK_QA_CHANNEL).
const QA_CENTRAL_PREVIEW_CHANNEL = "C0A854WE5JS";

async function main() {
  const preview = process.argv.includes("--dry-run");
  const days = parseInt(process.env.QA_NAG_DAYS ?? "90", 10);

  const linearApiKey = process.env.LINEAR_API_KEY;
  if (!linearApiKey) throw new Error("LINEAR_API_KEY is not set");

  const allIssuesTeams = (process.env.LINEAR_ALL_ISSUES_TEAMS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const bugs = await fetchLinearBugs(linearApiKey, since.toISOString(), { allIssuesTeams });
  const digest = buildDigest(bugs);

  console.log(`[qa-nag] window=${days}d total=${digest.total}`, JSON.stringify(digest.byVertical));

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = preview ? QA_CENTRAL_PREVIEW_CHANNEL : process.env.SLACK_QA_CHANNEL;
  if (!token || !channel) throw new Error("SLACK_BOT_TOKEN or SLACK_QA_CHANNEL is not set");

  const res = await postMessage(token, channel, digest.text, digest.blocks);
  if (!res.ok) throw new Error(`Slack error: ${res.error}`);
  console.log(`[qa-nag] sent ts=${res.ts} channel=${channel}${preview ? " (preview)" : ""}`);
}

main().catch((err) => {
  console.error("[qa-nag] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
