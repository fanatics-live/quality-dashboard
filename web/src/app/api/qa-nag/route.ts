import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { fetchLinearBugs } from "@/lib/integrations/linear";
import { buildDigest } from "@/lib/slack/qa-nag";
import { postMessage } from "@/lib/slack/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const send = url.searchParams.get("send") === "1";
  const days = parseInt(url.searchParams.get("days") ?? "90", 10);

  try {
    const env = getEnv();
    // Optional destination override — lets us post a preview to a specific
    // channel without changing SLACK_QA_CHANNEL.
    const channel = url.searchParams.get("channel") || env.slackQaChannel;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const bugs = await fetchLinearBugs(env.linearApiKey, since.toISOString(), {
      allIssuesTeams: env.allIssuesTeams,
    });
    const digest = buildDigest(bugs);

    if (!send) {
      // Dry-run preview: returns exactly what would be posted, sends nothing.
      return NextResponse.json({
        dryRun: true,
        windowDays: days,
        total: digest.total,
        byVertical: digest.byVertical,
        text: digest.text,
        blocks: digest.blocks,
      });
    }

    if (!env.slackBotToken || !channel) {
      return NextResponse.json(
        { error: "SLACK_BOT_TOKEN or SLACK_QA_CHANNEL not configured" },
        { status: 500 },
      );
    }

    const result = await postMessage(
      env.slackBotToken,
      channel,
      digest.text,
      digest.blocks,
    );
    if (!result.ok) {
      return NextResponse.json({ error: `Slack error: ${result.error}` }, { status: 502 });
    }
    return NextResponse.json({ sent: true, total: digest.total, ts: result.ts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
