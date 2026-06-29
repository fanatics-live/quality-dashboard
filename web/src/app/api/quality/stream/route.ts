import { getEnv } from "@/lib/env";
import { collectWithProgress, invalidateCache } from "@/lib/quality/collector";
import type { RangePreset } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_RANGES = new Set(["14d", "30d", "quarter", "cycle"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";
  const rangeParam = url.searchParams.get("range") ?? "14d";
  const range: RangePreset = VALID_RANGES.has(rangeParam) ? (rangeParam as RangePreset) : "14d";

  if (force) invalidateCache();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const env = getEnv();
        const result = await collectWithProgress(env, range, (evt) => {
          send("progress", evt);
        });
        send("complete", result);
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
