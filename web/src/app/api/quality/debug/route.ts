import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { collectWithTrends } from "@/lib/quality/collector";
import { isClassificationBug } from "@/lib/integrations/linear";
import type { RangePreset } from "@/lib/types";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = req.nextUrl;
  const range = (searchParams.get("range") ?? "30d") as RangePreset;
  const filter = searchParams.get("filter") ?? "unclassified";

  try {
    const env = getEnv();
    const { data } = await collectWithTrends(env, range);
    const classificationBugs = data.bugs.bugs.filter(isClassificationBug);

    let filtered = classificationBugs;
    if (filter === "unclassified") {
      filtered = classificationBugs.filter((b) => b.type === "unknown");
    } else if (filter === "regression") {
      filtered = classificationBugs.filter((b) => b.type === "regression");
    } else if (filter === "progression") {
      filtered = classificationBugs.filter((b) => b.type === "progression");
    }

    return NextResponse.json({
      filter,
      range,
      count: filtered.length,
      bugs: filtered.map((b) => ({
        id: b.id,
        title: b.title,
        team: b.team,
        vertical: b.vertical,
        type: b.type,
        severity: b.severity,
        environment: b.environment,
        status: b.status,
        stateType: b.stateType,
        createdAt: b.createdAt,
        url: b.url,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
