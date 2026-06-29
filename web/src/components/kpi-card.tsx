"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DetailModal, type ModalItem } from "./detail-modal";

type Accent = "default" | "danger" | "warning" | "success" | "info";

const ACCENT_BORDER: Record<Accent, string> = {
  default: "border-l-indigo-500",
  danger: "border-l-red-500",
  warning: "border-l-amber-500",
  success: "border-l-emerald-500",
  info: "border-l-blue-500",
};

export function KpiCard({
  value,
  label,
  detail,
  info,
  accent = "default",
  icon,
  delta,
  sparkline,
  href,
  modal,
}: {
  value: string | number;
  label: string;
  detail?: string;
  info?: ReactNode;
  accent?: Accent;
  icon?: ReactNode;
  delta?: ReactNode;
  sparkline?: ReactNode;
  href?: string;
  modal?: { title: string; color: string; items: ModalItem[] };
}) {
  const [open, setOpen] = useState(false);
  const clickableModal = !!modal && modal.items.length > 0;

  const content = (
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            {value}
          </span>
          {delta}
        </div>
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
          {label}
          {info && (
            <span className="relative group inline-flex shrink-0">
              <Info className="w-3 h-3 text-slate-400 cursor-help" />
              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] normal-case tracking-normal leading-relaxed shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                {info}
                <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
              </span>
            </span>
          )}
        </div>
        {detail && (
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{detail}</div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        {icon && <div className="text-slate-400 dark:text-slate-500">{icon}</div>}
        {sparkline && <div className="mt-1">{sparkline}</div>}
      </div>
    </div>
  );

  const cls = cn(
    "bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border-l-4 transition-colors",
    ACCENT_BORDER[accent],
    (href || clickableModal) && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all",
  );

  if (clickableModal) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={cn(cls, "text-left w-full")}>
          {content}
        </button>
        {open && (
          <DetailModal title={modal.title} color={modal.color} items={modal.items} onClose={() => setOpen(false)} />
        )}
      </>
    );
  }

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {content}
      </a>
    );
  }

  return <div className={cls}>{content}</div>;
}
