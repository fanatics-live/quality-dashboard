import { NextRequest, NextResponse } from "next/server";
import { getViewUrl } from "@/lib/integrations/linear-views";

export async function GET(req: NextRequest) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "LINEAR_API_KEY not set" }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const view = searchParams.get("view") ?? "";
  const value = searchParams.get("value") ?? undefined;

  const url = await getViewUrl(apiKey, view, value);
  return NextResponse.redirect(url);
}
