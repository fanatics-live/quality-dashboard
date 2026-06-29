"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { EnvFilter } from "@/lib/types";
import { EnvSelector } from "./env-selector";

export function EnvNav({ value, available }: { value: EnvFilter; available?: EnvFilter[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <EnvSelector
      value={value}
      available={available}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e === "all") params.delete("env");
        else params.set("env", e);
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
    />
  );
}
