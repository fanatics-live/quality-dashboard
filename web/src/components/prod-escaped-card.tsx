"use client";

import { useState } from "react";
import type { LinearBug, Delta } from "@/lib/types";
import { DetailModal, bugsToItems } from "./detail-modal";
import { DeltaBadge } from "./delta-badge";

export function ProdEscapedCard({ bugs, delta }: { bugs: LinearBug[]; delta?: Delta }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border-l-4 border-l-red-500 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => bugs.length > 0 && setOpen(true)}
              disabled={bugs.length === 0}
              className="text-3xl font-extrabold tracking-tight text-red-600 dark:text-red-400 tabular-nums enabled:hover:underline enabled:cursor-pointer disabled:cursor-default"
            >
              {bugs.length}
            </button>
            {delta && <DeltaBadge delta={delta} compact />}
          </div>
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-0.5">
            Escaped to Production
          </div>
        </div>
      </div>
      {open && (
        <DetailModal
          title="Bugs Escaped to Production"
          color="#dc2626"
          items={bugsToItems(bugs)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
