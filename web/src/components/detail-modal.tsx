"use client";

import { useState, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import type { LinearBug, IncidentRecord } from "@/lib/types";

export interface ModalItem {
  id: string;
  key: string;
  status: string;
  title: string;
  subtitle: string;
  url: string;
  group: string;
}

export function linearTicketKey(url: string): string {
  const m = url.match(/\/issue\/([^/]+)/);
  return m ? m[1] : url;
}

export function bugsToItems(bugs: LinearBug[]): ModalItem[] {
  return bugs.map((b) => ({
    id: b.id,
    key: linearTicketKey(b.url),
    status: b.status,
    title: b.title,
    subtitle: b.team,
    url: b.url,
    group: b.vertical || "Unassigned",
  }));
}

export function incidentsToItems(incidents: IncidentRecord[]): ModalItem[] {
  return incidents.map((i) => ({
    id: i.id,
    key: i.severity || "—",
    status: i.status,
    title: i.name,
    subtitle: new Date(i.createdAt).toLocaleDateString(),
    url: i.url,
    group: i.severity || "Unclassified",
  }));
}

export function DetailModal({ title, color, items, onClose }: {
  title: string;
  color: string;
  items: ModalItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = (() => {
    const byGroup: Record<string, ModalItem[]> = {};
    for (const it of items) (byGroup[it.group || "Unassigned"] ??= []).push(it);
    return Object.entries(byGroup).sort((a, b) => b[1].length - a[1].length);
  })();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (group: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${title} details`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[80vh] flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-xl">
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
            {title}
            <span className="text-xs font-normal text-slate-400">{items.length} item{items.length === 1 ? "" : "s"}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="text-sm text-slate-400 italic px-3 py-6 text-center">Nothing to show</p>
          ) : (
            groups.map(([group, groupItems]) => {
              const isCollapsed = collapsed.has(group);
              return (
                <div key={group} className="mb-2 last:mb-0">
                  <button
                    type="button"
                    onClick={() => toggle(group)}
                    aria-expanded={!isCollapsed}
                    className="sticky top-0 z-10 w-full flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-900/60 backdrop-blur rounded-md hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group}</span>
                    <span className="text-[10px] text-slate-400">{groupItems.length}</span>
                  </button>
                  {!isCollapsed && groupItems.map((it) => (
                    <a
                      key={it.id}
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">{it.key}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 shrink-0">{it.status}</span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5 line-clamp-2">{it.title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{it.subtitle}</p>
                    </a>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
