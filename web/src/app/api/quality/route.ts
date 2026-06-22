import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { collectDashboardData, invalidateCache } from "@/lib/quality/collector";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";

  if (force) invalidateCache();

  try {
    const env = getEnv();
    const data = await collectDashboardData(env);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
