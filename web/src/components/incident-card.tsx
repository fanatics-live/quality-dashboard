"use client";

import { useState } from "react";
import type { IncidentRecord, Delta } from "@/lib/types";
import { DetailModal, incidentsToItems } from "./detail-modal";
import { DeltaBadge } from "./delta-badge";

// Order severity groups SEV1 (most severe) at top → higher numbers at bottom.
function severityRank(s: string): number {
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : 99;
}

export function IncidentCard({ incidents, delta }: { incidents: IncidentRecord[]; delta?: Delta }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border-l-4 border-l-amber-500 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => incidents.length > 0 && setOpen(true)}
              disabled={incidents.length === 0}
              className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums enabled:hover:underline enabled:cursor-pointer disabled:cursor-default"
            >
              {incidents.length}
            </button>
            {delta && <DeltaBadge delta={delta} compact />}
          </div>
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-0.5">
            Incidents
          </div>
        </div>
      </div>
      {open && (
        <DetailModal
          title="Incidents"
          color="#f59e0b"
          items={incidentsToItems(incidents)}
          sortGroups={(a, b) => severityRank(a) - severityRank(b)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
