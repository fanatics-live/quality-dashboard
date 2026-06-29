"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { RangePreset } from "@/lib/types";
import { RangeSelector } from "./range-selector";

export function RangeNav({ value, comparison }: { value: RangePreset; comparison?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <RangeSelector
      value={value}
      comparison={comparison}
      onChange={(r) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("range", r);
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }}
    />
  );
}
