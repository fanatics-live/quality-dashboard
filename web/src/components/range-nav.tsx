"use client";

import { useRouter, usePathname } from "next/navigation";
import type { RangePreset } from "@/lib/types";
import { RangeSelector } from "./range-selector";

export function RangeNav({ value, comparison }: { value: RangePreset; comparison?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <RangeSelector
      value={value}
      comparison={comparison}
      onChange={(r) => router.push(`${pathname}?range=${r}`, { scroll: false })}
    />
  );
}
