import type { LinearBug } from "../types";
import { isValidBug, isOpen } from "../integrations/linear";

// QA responsibles per vertical (Slack user IDs). Vertical names must match
// the values produced by parseTeamHierarchy in integrations/linear.ts.
export const QA_BY_VERTICAL: Record<string, string[]> = {
  Marketplace: ["U0B5BLHNTMW", "U08N81Q0EDC", "U08QB6NCTS8"],
  "Live Breaking": ["U08GZ13SL3G", "U0B9Z39Q7C4", "U08NKMQ251R", "U0AHWEDMM7D"],
  "Instant Rips": ["U0A3TEV8BK6"],
  Collections: ["U08Q5B0V4BX", "U0A72UWNX54"],
  Growth: ["U08RZJWB2MC", "U08RQ1XE8QH"],
  Client: ["U08RZJWB2MC", "U08RQ1XE8QH"],
  Topps: ["U08RZJWB2MC", "U08RQ1XE8QH", "U07THRG2002"],
};

const MAX_BUGS_PER_VERTICAL = 15;

export function linearKey(url: string): string {
  const m = url.match(/\/issue\/([^/]+)/);
  return m ? m[1] : url;
}

// Which mandatory label dimensions are missing on a bug.
export function missingLabels(bug: LinearBug): string[] {
  const missing: string[] = [];
  if (bug.type === "unknown") missing.push("Bug type");
  if (bug.severity === "Unclassified") missing.push("Severity");
  if (bug.environment === "Unclassified") missing.push("Environment");
  return missing;
}

// Valid + open bugs in a QA-owned vertical that are missing a mandatory label.
// Verticals with no QA responsible (e.g. TLC Operations) are out of scope —
// there is nobody to action them and they would drown the signal.
export function findIncompleteBugs(bugs: LinearBug[]): LinearBug[] {
  return bugs.filter(
    (b) =>
      b.vertical in QA_BY_VERTICAL &&
      isValidBug(b) &&
      isOpen(b) &&
      missingLabels(b).length > 0,
  );
}

function groupByVertical(bugs: LinearBug[]): Map<string, LinearBug[]> {
  const map = new Map<string, LinearBug[]>();
  for (const b of bugs) {
    const list = map.get(b.vertical) ?? [];
    list.push(b);
    map.set(b.vertical, list);
  }
  return map;
}

function mentions(vertical: string): string {
  const ids = QA_BY_VERTICAL[vertical];
  if (!ids || ids.length === 0) return "";
  return ids.map((id) => `<@${id}>`).join(" ");
}

export interface Digest {
  total: number;
  byVertical: Array<{ vertical: string; count: number }>;
  text: string;
  blocks: unknown[];
}

export function buildDigest(bugs: LinearBug[]): Digest {
  const incomplete = findIncompleteBugs(bugs);
  const grouped = [...groupByVertical(incomplete).entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `🏷️ Bugs missing mandatory labels — ${incomplete.length}`, emoji: true },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Required labels: *Bug type* · *Severity* · *Environment*. Open bugs only.",
        },
      ],
    },
  ];

  if (incomplete.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: ":white_check_mark: All open bugs are properly labelled. Nice work!" },
    });
  }

  for (const [vertical, list] of grouped) {
    const tag = mentions(vertical);
    const head = `*${vertical}* — ${list.length} bug${list.length > 1 ? "s" : ""}${tag ? ` · ${tag}` : ""}`;
    const lines = list.slice(0, MAX_BUGS_PER_VERTICAL).map((b) => {
      const miss = missingLabels(b).join(", ");
      return `• <${b.url}|${linearKey(b.url)}> — _missing: ${miss}_`;
    });
    if (list.length > MAX_BUGS_PER_VERTICAL) {
      lines.push(`• … +${list.length - MAX_BUGS_PER_VERTICAL} more`);
    }
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `${head}\n${lines.join("\n")}` },
    });
  }

  const text =
    incomplete.length === 0
      ? "All open bugs are properly labelled."
      : `${incomplete.length} open bug(s) missing mandatory labels (Bug type / Severity / Environment).`;

  return {
    total: incomplete.length,
    byVertical: grouped.map(([vertical, list]) => ({ vertical, count: list.length })),
    text,
    blocks,
  };
}
